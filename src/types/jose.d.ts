declare module 'jose' {
  export class SignJWT {
    constructor(payload: Record<string, unknown>);
    setProtectedHeader(header: Record<string, unknown>): this;
    setIssuedAt(): this;
    setExpirationTime(exp: string): this;
    sign(secret: Uint8Array): Promise<string>;
  }

  export function jwtVerify(
    token: string,
    secret: Uint8Array,
    options?: { algorithms?: string[] },
  ): Promise<{ payload: Record<string, unknown> }>;
}
