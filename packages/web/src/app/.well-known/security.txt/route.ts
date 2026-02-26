export async function GET() {
  const body = `Contact: mailto:security@carapacesec.io
Expires: 2026-12-31T23:59:59.000Z
Preferred-Languages: en
Canonical: https://carapacesec.io/.well-known/security.txt
`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain" },
  });
}
