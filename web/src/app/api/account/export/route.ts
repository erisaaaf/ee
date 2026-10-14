import { authed } from "@/server/http";
import { exportData } from "@/server/services/privacy";

export const GET = authed(
  async ({ user }) => {
    const data = await exportData(user.id);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="vitality-export-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  },
  { rateLimit: { name: "export", limit: 10, windowSec: 3600 } },
);
