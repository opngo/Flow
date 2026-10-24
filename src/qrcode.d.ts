/** Minimal typings for the `qrcode` package (it ships none of its own). */
declare module 'qrcode' {
  export interface QRCodeToDataURLOptions {
    width?: number;
    margin?: number;
    color?: { dark?: string; light?: string };
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    type?: string;
  }
  export function toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>;
  export function toString(text: string, options?: QRCodeToDataURLOptions & { type?: 'svg' | 'utf8' | 'terminal' }): Promise<string>;
  const QRCode: { toDataURL: typeof toDataURL; toString: typeof toString };
  export default QRCode;
}
