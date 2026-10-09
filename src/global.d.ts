import type { DetailedHTMLProps, HTMLAttributes } from 'react';

type WebviewAttrs = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  src?: string;
  partition?: string;
  useragent?: string;
  allowpopups?: string;
  plugins?: string;
  preload?: string;
  webpreferences?: string;
};

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      webview: WebviewAttrs;
    }
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      webview: WebviewAttrs;
    }
  }
}
