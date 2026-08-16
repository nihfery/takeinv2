# Authorization

Authorization diterapkan berlapis:

- edge hanya menentukan pemilik route;
- middleware API memvalidasi token dan role;
- application service memeriksa ownership resource dan state transition;
- PostgreSQL constraint menjaga invariant lokal;
- gRPC internal memerlukan service token dan policy pemanggil.

Provider branch account hanya dapat mengakses cabang/permission yang ditetapkan.
Admin action sensitif membutuhkan role eksplisit dan menghasilkan audit event.
Chat thread, media object, booking, payment, dan subscription selalu diperiksa
berdasarkan actor serta tenant sebelum data dikembalikan.
