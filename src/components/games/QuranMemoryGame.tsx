import React, { useState, useCallback, useEffect } from 'react';
import { Volume2, VolumeX, RotateCcw, Lightbulb, Play, ArrowLeft, Star } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { soundFX } from '../../lib/audio';
import { apiFetch } from '../../lib/api';

type GameState = 'TITLE_MENU' | 'PLAYING' | 'GAME_OVER';

interface PairCard {
  uid: number;
  pairId: string;
  label: string;
  sub: string;
  flipped: boolean;
  matched: boolean;
}

const PAIRS_AR_NUMBERS = [
  { id: '1', a: '١ — واحد', b: 'سورة الفاتحة (آية ١)', subA: 'One', subB: 'Al-Hamdulillah' },
  { id: '2', a: '٢ — اثنان', b: 'قل هو الله أحد', subA: 'Two', subB: 'Al-Ikhlas' },
  { id: '3', a: '٣ — ثلاثة', b: 'قل أعوذ برب الفلق', subA: 'Three', subB: 'Al-Falaq' },
  { id: '4', a: '٤ — أربعة', b: 'قل أعوذ برب الناس', subA: 'Four', subB: 'An-Nas' },
  { id: '5', a: '٥ — خمسة', b: 'إنا أعطيناك الكوثر', subA: 'Five', subB: 'Al-Kawthar' },
  { id: '6', a: '٦ — ستة', b: 'والعصر إن الإنسان', subA: 'Six', subB: 'Al-Asr' },
];

function buildDeck(pairCount: number): PairCard[] {
  const chosen = PAIRS_AR_NUMBERS.slice(0, pairCount);
  const cards: PairCard[] = [];
  let uid = 1;
  for (const item of chosen) {
    cards.push({ uid: uid++, pairId: item.id, label: item.a, sub: item.subA, flipped: false, matched: false });
    cards.push({ uid: uid++, pairId: item.id, label: item.b, sub: item.subB, flipped: false, matched: false });
  }
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function QuranMemoryGame({ onExit }: { onExit: () => void }) {
  const { lang, user } = useApp();
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [deck, setDeck] = useState<PairCard[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [muted, setMuted] = useState(soundFX.muted);

  const isGuestSampleOnly = !user || user.role !== 'student';
  const pairCount = isGuestSampleOnly ? 4 : 6;

  const startGame = useCallback(() => {
    soundFX.playClick();
    setDeck(buildDeck(pairCount));
    setSelected([]);
    setMoves(0);
    setHintsUsed(0);
    setGameState('PLAYING');
  }, [pairCount]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (gameState === 'TITLE_MENU' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        startGame();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gameState, startGame]);

  const handleFlip = (uid: number) => {
    if (gameState !== 'PLAYING') return;
    if (selected.length >= 2) return;
    const card = deck.find((c) => c.uid === uid);
    if (!card || card.flipped || card.matched) return;

    soundFX.playClick();
    const updated = deck.map((c) => (c.uid === uid ? { ...c, flipped: true } : c));
    setDeck(updated);
    const nextSel = [...selected, uid];
    setSelected(nextSel);

    if (nextSel.length === 2) {
      setMoves((m) => m + 1);
      const [firstId, secondId] = nextSel;
      const c1 = updated.find((c) => c.uid === firstId)!;
      const c2 = updated.find((c) => c.uid === secondId)!;

      if (c1.pairId === c2.pairId) {
        soundFX.playSuccess();
        const afterMatch = updated.map((c) =>
          c.uid === firstId || c.uid === secondId ? { ...c, matched: true } : c
        );
        setDeck(afterMatch);
        setSelected([]);

        if (afterMatch.every((c) => c.matched)) {
          const finalScore = Math.max(100, 360 - moves * 12 - hintsUsed * 25);
          if (user?.role === 'student') {
            apiFetch('/api/student/games/progress', {
              method: 'POST',
              body: JSON.stringify({
                game_slug: 'quran-memory',
                score: finalScore,
                stars: finalScore >= 260 ? 6 : 4,
                completed_levels: 2,
              }),
            }).catch(() => {});
          }
          setTimeout(() => setGameState('GAME_OVER'), 350);
        }
      } else {
        soundFX.playError();
        setTimeout(() => {
          setDeck((prev) =>
            prev.map((c) => (c.uid === firstId || c.uid === secondId ? { ...c, flipped: false } : c))
          );
          setSelected([]);
        }, 620);
      }
    }
  };

  const triggerHint = () => {
    const unmatched = deck.filter((c) => !c.matched);
    if (!unmatched.length) return;
    const targetPair = unmatched[0].pairId;
    setHintsUsed((h) => h + 1);
    setDeck((prev) => prev.map((c) => (c.pairId === targetPair ? { ...c, flipped: true } : c)));
    setTimeout(() => {
      setDeck((prev) => prev.map((c) => (c.pairId === targetPair && !c.matched ? { ...c, flipped: false } : c)));
    }, 900);
  };

  const finalScore = Math.max(100, 360 - moves * 12 - hintsUsed * 25);

  return (
    <div className="fixed inset-0 z-50 bg-[#0F5132] text-[#F8F5EC] flex flex-col select-none">
      {/* Top HUD */}
      <div className="flex items-center justify-between px-4 sm:px-8 py-4 border-b border-white/15 bg-[#0A3A24]">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold bg-white/10 hover:bg-white/20 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
            <span>{lang === 'ar' ? 'خروج' : 'Exit'}</span>
          </button>
          <span className="text-sm font-semibold text-amber-300">
            {lang === 'ar' ? 'ذاكرة الآيات والأرقام' : 'Ayah & Numbers Memory'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm font-mono-tabular">
          <span>
            {lang === 'ar' ? 'المحاولات:' : 'Moves:'} {moves}
          </span>
          {gameState === 'PLAYING' && (
            <button
              onClick={triggerHint}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 cursor-pointer"
            >
              <Lightbulb className="w-4 h-4" />
              <span>{lang === 'ar' ? 'تلميح' : 'Hint'}</span>
            </button>
          )}
          <button
            onClick={() => {
              soundFX.muted = !muted;
              setMuted(!muted);
            }}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Playfield */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 overflow-y-auto">
        {gameState === 'TITLE_MENU' && (
          <div className="max-w-lg w-full text-center space-y-6">
            <h1 className="text-3xl sm:text-4xl font-bold">
              {lang === 'ar' ? 'ذاكرة الآيات والأرقام' : 'Ayah & Numbers Memory'}
            </h1>
            <p className="text-emerald-100 leading-relaxed">
              {lang === 'ar'
                ? 'اقلب البطاقات لمطابقة الأرقام العربية مع الآيات الكريمة من قصار السور.'
                : 'Flip cards to pair Arabic numerals with matching short Quranic verses.'}
            </p>
            <p className="text-xs text-emerald-200">
              {lang === 'ar' ? 'التحكم: النقر على بطاقتين متطابقتين · تلميح متاح' : 'Controls: Click two matching cards · Hint available'}
            </p>
            <button
              onClick={startGame}
              className="inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-base font-bold bg-[#C98A1E] hover:bg-[#B47A16] text-white cursor-pointer"
            >
              <Play className="w-5 h-5" />
              <span>{lang === 'ar' ? 'ابدأ الجولة' : 'Start Round'}</span>
            </button>
          </div>
        )}

        {gameState === 'PLAYING' && (
          <div className="max-w-3xl w-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
            {deck.map((card) => {
              const revealed = card.flipped || card.matched;
              return (
                <button
                  key={card.uid}
                  onClick={() => handleFlip(card.uid)}
                  className={`min-h-[118px] rounded-2xl border-2 p-3 flex flex-col items-center justify-center text-center transition-transform duration-150 cursor-pointer ${
                    card.matched
                      ? 'bg-emerald-900/90 border-amber-400 text-amber-200'
                      : revealed
                      ? 'bg-[#FAF8F3] border-amber-500 text-[#0F213E]'
                      : 'bg-[#146C43] hover:bg-[#198754] border-white/25 text-white'
                  }`}
                >
                  {revealed ? (
                    <>
                      <span className="text-base sm:text-lg font-bold leading-snug">{card.label}</span>
                      <span className="text-xs opacity-70 mt-1">{card.sub}</span>
                    </>
                  ) : (
                    <span className="text-2xl font-bold text-amber-300">✦</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {gameState === 'GAME_OVER' && (
          <div className="max-w-md w-full rounded-2xl bg-[#0A3A24] border border-white/20 p-8 text-center space-y-5">
            <Star className="w-12 h-12 text-amber-300 mx-auto" />
            <h2 className="text-2xl font-bold">
              {lang === 'ar' ? 'مبارك! طابقت جميع البطاقات' : 'All Pairs Matched!'}
            </h2>
            <p className="text-emerald-100 font-mono-tabular">
              {lang === 'ar' ? `النتيجة: ${finalScore} نقطة (${moves} محاولة)` : `Score: ${finalScore} pts (${moves} moves)`}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={startGame}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-3 font-bold bg-[#C98A1E] hover:bg-[#B47A16] text-white cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{lang === 'ar' ? 'العب مجدداً' : 'Play Again'}</span>
              </button>
              <button
                onClick={onExit}
                className="rounded-xl px-5 py-3 font-semibold bg-white/15 hover:bg-white/25 text-white cursor-pointer"
              >
                {lang === 'ar' ? 'خروج' : 'Exit'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
