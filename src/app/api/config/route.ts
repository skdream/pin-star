/**
 * GET /api/config — 第三方服务配置状态（"留好配置项"需求）
 * 服务清单定义在 src/lib/service-config.ts，用 process.env 是否非空判定 configured。
 */
import { NextResponse } from "next/server";
import { getServiceStatuses } from "@/lib/service-config";

export async function GET() {
  try {
    return NextResponse.json({ services: getServiceStatuses() });
  } catch (e) {
    console.error("[GET /api/config]", e);
    return NextResponse.json({ error: "获取服务配置失败" }, { status: 500 });
  }
}
