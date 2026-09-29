/**
 * 拼读星球 PhonicsStar — 第三方服务配置清单
 * 服务端唯一事实来源：/api/config 读取这里，用 process.env 是否非空判定 configured。
 * 新增服务时只需在 SERVICES 里加一条，并在 .env.example 里补变量。
 */

export interface ServiceEnvSpec {
  /** 环境变量名 */
  name: string;
  /** 变量用途说明（前端 tooltip / .env.example 注释共用） */
  description: string;
}

export interface ServiceSpec {
  /** 服务标识（前端用 key 渲染卡片） */
  key: string;
  /** 展示名 */
  name: string;
  /** 一句话说明该服务启用后带来的能力 */
  description: string;
  /** 需要的全部环境变量；全部非空才算 configured */
  envVars: ServiceEnvSpec[];
  /** 是否允许留空即视为配置好（内置能力恒 true） */
  alwaysConfigured?: boolean;
}

export const SERVICES: ServiceSpec[] = [
  {
    key: "azure-tts",
    name: "Azure Neural TTS",
    description: "微软神经语音合成，配置后服务端发音自动切换 Azure 音色（Jenny / Sonia）",
    envVars: [
      { name: "AZURE_TTS_KEY", description: "Azure 语音服务订阅密钥" },
      { name: "AZURE_TTS_REGION", description: "Azure 语音服务区域，如 eastasia" },
    ],
  },
  {
    key: "azure-asr",
    name: "Azure 发音评测",
    description: "微软 Pronunciation Assessment 发音评测，可对跟读打分（预留）",
    envVars: [
      { name: "AZURE_SPEECH_KEY", description: "Azure 语音服务订阅密钥（评测用）" },
      { name: "AZURE_SPEECH_REGION", description: "Azure 语音服务区域" },
    ],
  },
  {
    key: "iflytek-eval",
    name: "讯飞语音评测",
    description: "科大讯飞语音评测（fieval），国内备选的跟读评分引擎（预留）",
    envVars: [
      { name: "IFLYTEK_APP_ID", description: "讯飞开放平台应用 ID" },
      { name: "IFLYTEK_API_KEY", description: "讯飞开放平台 API Key" },
      { name: "IFLYTEK_API_SECRET", description: "讯飞开放平台 API Secret" },
    ],
  },
  {
    key: "baidu-ocr",
    name: "百度手写 OCR",
    description: "识别纸面听写照片自动批改（留好配置项）",
    envVars: [
      { name: "BAIDU_OCR_API_KEY", description: "百度智能云 API Key" },
      { name: "BAIDU_OCR_SECRET_KEY", description: "百度智能云 Secret Key" },
    ],
  },
  {
    key: "oss",
    name: "音频存储 OSS",
    description: "跟读音频云端存储（预留）",
    envVars: [
      { name: "OSS_ENDPOINT", description: "OSS Endpoint，如 oss-cn-hangzhou.aliyuncs.com" },
      { name: "OSS_ACCESS_KEY_ID", description: "OSS AccessKey ID" },
      { name: "OSS_ACCESS_KEY_SECRET", description: "OSS AccessKey Secret" },
      { name: "OSS_BUCKET", description: "OSS Bucket 名称" },
    ],
  },
  {
    key: "built-in-llm",
    name: "内置 AI 能力",
    description: "平台内置 z-ai SDK（TTS / LLM），开箱即用，无需配置",
    envVars: [],
    alwaysConfigured: true,
  },
];

export interface ServiceEnvVarStatus {
  name: string;
  configured: boolean;
}

export interface ServiceStatus {
  key: string;
  name: string;
  description: string;
  configured: boolean;
  envVars: ServiceEnvVarStatus[];
}

/** 判定单个环境变量是否已配置（非 undefined 且 trim 后非空） */
export function isEnvSet(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

/** 汇总全部服务配置状态（/api/config 使用） */
export function getServiceStatuses(): ServiceStatus[] {
  return SERVICES.map((svc) => {
    const envVars: ServiceEnvVarStatus[] = svc.envVars.map((ev) => ({
      name: ev.name,
      configured: isEnvSet(ev.name),
    }));
    const configured = svc.alwaysConfigured
      ? true
      : envVars.length > 0 && envVars.every((ev) => ev.configured);
    return {
      key: svc.key,
      name: svc.name,
      description: svc.description,
      configured,
      envVars,
    };
  });
}
