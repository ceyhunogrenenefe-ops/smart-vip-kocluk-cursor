import { useEffect } from 'react';

declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } };
  }
}

const EMBED_SCRIPT_ID = 'instagram-embed-script';

function ensureInstagramEmbedScript() {
  if (document.getElementById(EMBED_SCRIPT_ID)) {
    window.instgrm?.Embeds.process();
    return;
  }
  const script = document.createElement('script');
  script.id = EMBED_SCRIPT_ID;
  script.src = 'https://www.instagram.com/embed.js';
  script.async = true;
  script.onload = () => window.instgrm?.Embeds.process();
  document.body.appendChild(script);
}

type Props = {
  permalink: string;
  className?: string;
};

export default function InstagramEmbed({ permalink, className }: Props) {
  const cleanUrl = permalink.replace(/\?.*$/, '').replace(/\/$/, '');
  const embedPermalink = `${cleanUrl}/?utm_source=ig_embed&utm_campaign=loading`;

  useEffect(() => {
    ensureInstagramEmbedScript();
  }, [cleanUrl]);

  return (
    <div className={className}>
      <blockquote
        className="instagram-media"
        data-instgrm-captioned
        data-instgrm-permalink={embedPermalink}
        data-instgrm-version="14"
        style={{
          background: '#FFF',
          border: 0,
          borderRadius: '12px',
          boxShadow: '0 0 1px 0 rgba(0,0,0,0.5), 0 1px 10px 0 rgba(0,0,0,0.15)',
          margin: '1px auto',
          maxWidth: 540,
          minWidth: 326,
          padding: 0,
          width: '100%'
        }}
      >
        <a href={cleanUrl} target="_blank" rel="noreferrer">
          Bu gönderiyi Instagram&apos;da gör
        </a>
      </blockquote>
    </div>
  );
}
