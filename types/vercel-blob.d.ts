declare module '@vercel/blob' {
  export interface PutOptions {
    access?: 'public';
    contentType?: string;
    addRandomSuffix?: boolean;
  }

  export interface PutBlobResult {
    url: string;
  }

  export function put(
    pathname: string,
    body: Blob | ArrayBuffer | Uint8Array | string,
    options?: PutOptions
  ): Promise<PutBlobResult>;

  export function del(url: string | string[]): Promise<void>;
}
