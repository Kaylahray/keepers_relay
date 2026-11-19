import { ImageResponse } from 'next/og';
import { MAP_IMG } from '@/lib/crowns/art';
import { racePreview } from '@/lib/server/race-preview';

const size = { width: 1200, height: 630 };

export const dynamic = 'force-dynamic';

const LIME = '#99ee2d';
const GOLD = '#e1bf47';
const MAGENTA = '#ff56f6';
const STAT_COLORS = [LIME, GOLD, '#ffffff'];

/** The card a shared race link shows: the track's picture, the stake, the seats and the clock, or who won. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const preview = await racePreview(id).catch(() => null);
  const photo = new URL(MAP_IMG[preview?.map ?? 0] ?? MAP_IMG[0]!, request.url).toString();

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#111111', color: '#ffffff', fontFamily: 'sans-serif' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt="" width={1200} height={630} style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 630, objectFit: 'cover' }} />
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '56px 72px',
            background: 'linear-gradient(to top, rgba(17,17,17,0.97) 0%, rgba(17,17,17,0.8) 45%, rgba(17,17,17,0.3) 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', fontSize: 38, fontWeight: 800, letterSpacing: 4 }}>CROWNS</div>
            <div style={{ display: 'flex', fontSize: 24, color: LIME, border: `2px solid ${LIME}`, padding: '8px 18px', textTransform: 'uppercase', background: 'rgba(17,17,17,0.6)' }}>
              {preview ? (preview.stage === 'finished' ? 'Finished' : preview.stage === 'open' ? 'Seats open' : 'Starting') : 'Live on CKB'}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 30, color: MAGENTA, textTransform: 'uppercase', letterSpacing: 3 }}>
              {preview ? `${preview.track} · 3 laps` : '3D car races on CKB'}
            </div>
            <div style={{ display: 'flex', fontSize: 78, fontWeight: 800, lineHeight: 1.05, marginTop: 10, maxWidth: 1050 }}>
              {preview ? preview.headline : 'Race. The winner gets paid automatically.'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 56 }}>
              {(preview?.stats ?? []).map((stat, i) => (
                <div key={stat.label} style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', fontSize: 22, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>{stat.label}</div>
                  <div style={{ display: 'flex', fontSize: 54, fontWeight: 800, color: STAT_COLORS[i] }}>{stat.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', fontSize: 24, color: 'rgba(255,255,255,0.7)' }}>{preview?.host ? `Hosted by @${preview.host}` : 'Live races on CKB'}</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
