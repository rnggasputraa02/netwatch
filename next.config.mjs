/** Header keamanan konservatif. CSP sengaja hanya membatasi framing/base/form/object (tidak membatasi script) agar tidak merusak hidrasi Next.js; ketatnya CSP penuh belum diuji di browser. */
const security = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];
// images.unoptimized: NetWatch tidak memakai next/image; mematikan endpoint /_next/image menutup jalur advisory Image Optimizer (mitigasi, BUKAN perbaikan: npm audit tetap menandai versi next).
const c = { poweredByHeader: false, images: { unoptimized: true }, async headers() { return [{ source: "/:path*", headers: security }]; } };
export default c;
