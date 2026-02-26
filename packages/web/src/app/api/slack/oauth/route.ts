import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Slack OAuth not configured" },
      { status: 500 }
    );
  }

  // Exchange code for access token
  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  const data = await response.json();

  if (!data.ok) {
    return NextResponse.json(
      { error: data.error ?? "OAuth failed" },
      { status: 400 }
    );
  }

  // In a production app, you'd store the token in the database
  // associated with the user/team. For now, redirect to success page.
  const baseUrl = process.env.NEXTAUTH_URL ?? "https://carapacesec.io";
  return NextResponse.redirect(
    `${baseUrl}/settings?slack=connected`
  );
}
