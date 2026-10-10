export class HttpRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
  ) {
    super(message);
    this.name = "HttpRequestError";
  }
}

export function isAccessDeniedError(error: unknown) {
  return error instanceof HttpRequestError && [401, 403].includes(error.status);
}

export class HistoryWindowUnsupportedError extends Error {
  constructor() {
    super("当前服务端不支持指定时间窗口，请升级 Komari 后重试");
    this.name = "HistoryWindowUnsupportedError";
  }
}

export function historyRequestErrorMessage(error: unknown, fallback: string) {
  if (error instanceof HistoryWindowUnsupportedError) return error.message;
  if (error instanceof HttpRequestError && error.status === 401) {
    return "登录状态已失效，请重新登录后重试";
  }
  if (error instanceof HttpRequestError && error.status === 403) {
    return "没有权限读取历史数据";
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return "历史数据查询超时，请缩短时间范围或重试";
  }
  return fallback;
}
