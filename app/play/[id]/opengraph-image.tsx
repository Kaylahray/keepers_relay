import { ImageResponse } from 'next/og';
import { crownPreview } from '@/lib/server/crown-preview';

export const alt = 'A crown on Crowns: the challenge, the pot and the clock';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const LIME = '#99ee2d';
const GOLD = '#e1bf47';
const MAGENTA = '#ff56f6';

/** The card a shared crown link shows: game, pot, score to beat and time left, in the app's colours. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const preview = await crownPreview(id);
  const stats = preview
    ? [
        { label: 'Pot', value: `${preview.pot} CKB`, color: LIME },
        { label: preview.finished ? 'Winning score' : 'Score to beat', value: String(preview.toBeat), color: GOLD },
        { label: 'Clock', value: preview.clock, color: '#ffffff' },
      ]
    : [];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          background: 'linear-gradient(135deg, #0b0b12 0%, #1a0f2b 60%, #2a0f3d 100%)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 800, letterSpacing: 4 }}>CROWNS</div>
          <div
            style={{
              display: 'flex',
              fontSize: 24,
              color: LIME,
              border: `2px solid ${LIME}`,
              padding: '8px 18px',
              textTransform: 'uppercase',
            }}
          >
            {preview ? preview.game : 'Live on CKB'}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 30, color: MAGENTA, textTransform: 'uppercase', letterSpacing: 3 }}>
            {preview ? preview.title : 'Beat the score. Take the crown.'}
          </div>
          <div style={{ display: 'flex', fontSize: 76, fontWeight: 800, lineHeight: 1.05, marginTop: 12, maxWidth: 1000 }}>
            {preview ? preview.headline : 'The chain replays every run.'}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 56 }}>
            {stats.map((stat) => (
              <div key={stat.label} style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', fontSize: 22, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' }}>
                  {stat.label}
                </div>
                <div style={{ display: 'flex', fontSize: 56, fontWeight: 800, color: stat.color }}>{stat.value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', fontSize: 24, color: 'rgba(255,255,255,0.6)' }}>
            {preview?.host ? `Hosted by @${preview.host}` : 'Skill game on CKB'}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
