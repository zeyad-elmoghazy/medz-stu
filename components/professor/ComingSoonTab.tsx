'use client';

type Props = {
  title: string;
  description: string;
  bullets?: string[];
};

export function ComingSoonTab({ title, description, bullets = [] }: Props) {
  return (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        padding: '80px 20px',
      }}
    >
      <div
        style={{
          maxWidth: 520,
          textAlign: 'center',
          background: '#161B26',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 22,
          padding: 40,
        }}
      >
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: 16,
            margin: '0 auto 20px',
            background: 'linear-gradient(135deg,#7C3AED,#8B5CF6)',
            display: 'grid',
            placeItems: 'center',
            fontSize: 26,
            boxShadow: '0 0 24px rgba(124,58,237,0.4)',
          }}
        >
          ✨
        </div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#C4B5FD',
            marginBottom: 10,
          }}
        >
          Coming soon
        </div>
        <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>
          {title}
        </h2>
        <p style={{ marginTop: 12, fontSize: 13, color: '#94A3B8', lineHeight: 1.6 }}>
          {description}
        </p>

        {bullets.length > 0 && (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: '24px 0 0',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              textAlign: 'left',
            }}
          >
            {bullets.map((b) => (
              <li
                key={b}
                style={{
                  display: 'flex',
                  gap: 10,
                  fontSize: 12.5,
                  color: '#CBD5E1',
                }}
              >
                <span style={{ color: '#8B5CF6', flex: 'none' }}>◆</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
