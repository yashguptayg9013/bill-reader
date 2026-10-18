import { connection } from "next/server";
import { passcodeRequired } from "@/lib/demo";

export async function GET() {
  // Read env at request time, so changing DEMO_PASSCODE doesn't need a rebuild.
  await connection();
  return Response.json({
    passcodeRequired: passcodeRequired(),
    sheetsConfigured: Boolean(process.env.GOOGLE_SHEETS_WEBHOOK_URL),
  });
}
