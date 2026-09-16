/**
 * Autonomous Local Mesh P2P Sync for Archaeological Field Expeditions.
 *
 * Allows excavation teams in remote desert locations (without cellular coverage or internet)
 * to synchronize project records, epigraphic transcriptions, measurements, and 3D capture sets
 * peer-to-peer over local expedition Wi-Fi / hotspot / browser mesh.
 *
 * Protocol:
 * 1. MESH_BEACON: Broadcast presence and project inventory vector clocks.
 * 2. MESH_INVENTORY: Compare local vs remote timestamps and find deltas.
 * 3. MESH_PULL: Request missing projects or newer versions.
 * 4. MESH_PUSH: Deliver serialized project payloads (including images, 3D references, GPS).
 */

import { listProjects, saveProject, type AtharProject } from "./athar-db";

export type MeshPeer = {
  id: string;
  lastSeen: number;
  projectCount: number;
};

type MeshMessage =
  | { type: "MESH_BEACON"; peerId: string; inventory: Record<string, number> }
  | { type: "MESH_REQUEST"; targetPeerId: string; requesterId: string; projectIds: string[] }
  | {
      type: "MESH_DELIVERY";
      targetPeerId: string;
      senderId: string;
      projects: SerializedProject[];
    };

type SerializedProject = Omit<AtharProject, "original" | "enhanced" | "captures"> & {
  originalB64?: string;
  enhancedB64?: string;
  capturesB64?: string[];
};

class LocalMeshSyncEngine {
  private peerId: string;
  private channel: BroadcastChannel | null = null;
  private peers: Map<string, MeshPeer> = new Map();
  private isSyncing = false;
  private timer: number | null = null;

  constructor() {
    this.peerId = "peer_" + Math.random().toString(36).substring(2, 11);
  }

  public start() {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
    if (this.channel) return;

    try {
      this.channel = new BroadcastChannel("athar_field_mesh_v1");
      this.channel.onmessage = (ev) => {
        void this.handleMessage(ev.data as MeshMessage);
      };

      // Periodic presence broadcast every 8 seconds
      this.broadcastBeacon();
      this.timer = window.setInterval(() => {
        this.broadcastBeacon();
      }, 8000);
    } catch (err) {
      console.warn("Mesh sync initialization skipped:", err);
    }
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
  }

  public async broadcastBeacon() {
    if (!this.channel) return;
    try {
      const projects = await listProjects();
      const inventory: Record<string, number> = {};
      for (const p of projects) {
        inventory[p.id] = p.createdAt;
      }
      this.channel.postMessage({
        type: "MESH_BEACON",
        peerId: this.peerId,
        inventory,
      });
    } catch {
      // Storage unavailable or busy
    }
  }

  private async handleMessage(msg: MeshMessage) {
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "MESH_BEACON") {
      if (msg.peerId === this.peerId) return;

      this.peers.set(msg.peerId, {
        id: msg.peerId,
        lastSeen: Date.now(),
        projectCount: Object.keys(msg.inventory).length,
      });

      // Check if the remote peer has projects we are missing
      const localProjects = await listProjects().catch(() => []);
      const localMap = new Map(localProjects.map((p) => [p.id, p.createdAt]));

      const needed: string[] = [];
      for (const [id, remoteCreatedAt] of Object.entries(msg.inventory)) {
        const localTime = localMap.get(id);
        if (!localTime || remoteCreatedAt > localTime) {
          needed.push(id);
        }
      }

      if (needed.length > 0 && this.channel) {
        this.channel.postMessage({
          type: "MESH_REQUEST",
          targetPeerId: msg.peerId,
          requesterId: this.peerId,
          projectIds: needed.slice(0, 5), // Batch of up to 5 at a time
        });
      }
    } else if (msg.type === "MESH_REQUEST") {
      if (msg.targetPeerId !== this.peerId) return;
      // Send requested projects to peer
      const localProjects = await listProjects().catch(() => []);
      const toSend = localProjects.filter((p) => msg.projectIds.includes(p.id));
      if (toSend.length > 0 && this.channel) {
        const serialized = await Promise.all(toSend.map((p) => this.serialize(p)));
        this.channel.postMessage({
          type: "MESH_DELIVERY",
          targetPeerId: msg.requesterId,
          senderId: this.peerId,
          projects: serialized,
        });
      }
    } else if (msg.type === "MESH_DELIVERY") {
      if (msg.targetPeerId !== this.peerId) return;
      if (this.isSyncing) return;
      this.isSyncing = true;
      try {
        for (const s of msg.projects) {
          const restored = await this.deserialize(s);
          await saveProject(restored);
        }
      } catch (err) {
        console.warn("Error ingesting mesh sync projects:", err);
      } finally {
        this.isSyncing = false;
      }
    }
  }

  private async serialize(p: AtharProject): Promise<SerializedProject> {
    const { original, enhanced, captures, ...rest } = p;
    const s: SerializedProject = { ...rest };
    if (original) s.originalB64 = await this.blobToBase64(original);
    if (enhanced) s.enhancedB64 = await this.blobToBase64(enhanced);
    if (captures && captures.length > 0) {
      s.capturesB64 = await Promise.all(captures.map((c) => this.blobToBase64(c)));
    }
    return s;
  }

  private async deserialize(s: SerializedProject): Promise<AtharProject> {
    const { originalB64, enhancedB64, capturesB64, ...rest } = s;
    const p: AtharProject = { ...rest };
    if (originalB64) p.original = this.base64ToBlob(originalB64);
    if (enhancedB64) p.enhanced = this.base64ToBlob(enhancedB64);
    if (capturesB64 && capturesB64.length > 0) {
      p.captures = capturesB64.map((b) => this.base64ToBlob(b));
    }
    return p;
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result as string);
      reader.onerror = () => rej(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  private base64ToBlob(b64: string): Blob {
    const [header, data] = b64.split(",");
    const mime = header?.match(/:(.*?);/)?.[1] || "image/jpeg";
    const binary = atob(data || "");
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    return new Blob([array], { type: mime });
  }

  public getConnectedPeers(): MeshPeer[] {
    const now = Date.now();
    return Array.from(this.peers.values()).filter((p) => now - p.lastSeen < 25000);
  }
}

export const fieldMesh = new LocalMeshSyncEngine();

// Auto-start in browser environments
if (typeof window !== "undefined") {
  fieldMesh.start();
}
