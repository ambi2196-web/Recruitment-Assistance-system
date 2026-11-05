import { NextResponse, type NextRequest } from "next/server";
import { generateDigest } from "@/lib/digest";
import { getDb } from "@/lib/db";
import { safeMessage } from "@/lib/requirements";

// Called weekly by the host's scheduler (FR-11.3). With no secret set it stays closed,
// because an open route would let anyone spend the AI budget.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }

  try {
    await generateDigest({ db: getDb() });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: safeMessage(error) });
  }
}
