/** Shape of one documented, openly licensed inscription photograph. */
export type CorpusImage = {
  id: string;
  title: string;
  siglum: string | null;
  script: string;
  image_url: string;
  source_url: string | null;
  license: string;
  credit: string | null;
  notes: string | null;
  labelled_signs: number;
  unknown_signs: number;
  created_at: string;
};
