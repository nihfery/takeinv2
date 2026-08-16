# File security

- Upload divalidasi berdasarkan MIME, extension allowlist, dan ukuran maksimum.
- SVG, executable, serta format arbitrary tidak diterima.
- Object key dibuat acak dan tidak mengandung nama atau identifier sensitif.
- Dokumen provider dan attachment chat bersifat private; akses membutuhkan actor,
  tenant/participant, state, serta signed URL berumur pendek.
- Browser tidak pernah menerima credential bucket atau raw private object path.
- Log tidak boleh memuat object credential, signed URL, atau query signature.
- Bucket produksi wajib memiliki encryption, versioning/lifecycle, backup,
  access logging, serta CORS minimum.

Malware scanning/content disarm untuk PDF dan gambar tetap menjadi kontrol
platform yang harus dipenuhi sebelum menerima upload produksi berisiko tinggi.
