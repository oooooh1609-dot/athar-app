UPDATE public.admin_credentials
SET password_hash = 'pbkdf2$100000$e9548609dc5ba24399ed1e2b9c6ab905$1950de7401d4ba860cce782d5cff0971b48d83621e8cc2faf11230a53535ec1d',
    updated_at = now()
WHERE id = true;