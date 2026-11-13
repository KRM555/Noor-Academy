import React, { useEffect, useState, useCallback } from 'react';
import { Volume2, VolumeX, RotateCcw, Pause, Play, Star, ArrowLeft } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { soundFX } from '../../lib/audio';
import { apiFetch } from '../../lib/api';

type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'ROUND_SUMMARY' | 'GAME_OVER';

interface LetterChallenge {
  targetChar: string;
  soundLabelAr: string;
  soundLabelEn: string;
  harakahAr: string;
  harakahEn: string;
  options: string[];
}

const LEVELS: LetterChallenge[][] = [
  [
    { targetChar: 'بَ', soundLabelAr: 'باء مفتوحة (بَ)', soundLabelEn: 'Baa with Fatha (Ba)', harakahAr: 'فتحة', harakahEn: 'Fatha', options: ['بَ', 'بِ', 'بُ', 'تَ'] },
    { targetChar: 'تِ', soundLabelAr: 'تاء مكسورة (تِ)', soundLabelEn: 'Taa with Kasra (Ti)', harakahAr: 'كسرة', harakahEn: 'Kasra', options: ['تَ', 'تِ', 'ثِ', 'بِ'] },
    { targetChar: 'ثُ', soundLabelAr: 'ثاء مضمومة (ثُ)', soundLabelEn: 'Thaa with Damma (Thu)', harakahAr: 'ضمة', harakahEn: 'Damma', options: ['ثَ', 'ثِ', 'ثُ', 'تُ'] },
    { targetChar: 'نَ', soundLabelAr: 'نون مفتوحة (نَ)', soundLabelEn: 'Noon with Fatha (Na)', harakahAr: 'فتحة', harakahEn: 'Fatha', options: ['بَ', 'يَ', 'نَ', 'نُ'] },
  ],
  [
    { targetChar: 'جُ', soundLabelAr: 'جيم مضمومة (جُ)', soundLabelEn: 'Jeem with Damma (Ju)', harakahAr: 'ضمة', harakahEn: 'Damma', options: ['حُ', 'جُ', 'خُ', 'جَ'] },
    { targetChar: 'سِ', soundLabelAr: 'سين مكسورة (سِ)', soundLabelEn: 'Seen with Kasra (Si)', harakahAr: 'كسرة', harakahEn: 'Kasra', options: ['شِ', 'سَ', 'سِ', 'صِ'] },
    { targetChar: 'قَ', soundLabelAr: 'قاف مفتوحة (قَ)', soundLabelEn: 'Qaf with Fatha (Qa)', harakahAr: 'فتحة', harakahEn: 'Fatha', options: ['فَ', 'قَ', 'قُ', 'كَ'] },
    { targetChar: 'مُ', soundLabelAr: 'ميم مضمومة (مُ)', soundLabelEn: 'Meem with Damma (Mu)', harakahAr: 'ضمة', harakahEn: 'Damma', options: ['مَ', 'مِ', 'مُ', 'لُ'] },
  ],
  [
    { targetChar: 'ضَ', soundLabelAr: 'ضاد مفتوحة (ضَ)', soundLabelEn: 'Dad with Fatha (Da)', harakahAr: 'فتحة', harakahEn: 'Fatha', options: ['صَ', 'ضَ', 'طَ', 'ضِ'] },
    { targetChar: 'عِ', soundLabelAr: 'عين مكسورة (عِ)', soundLabelEn: 'Ayn with Kasra (Ei)', harakahAr: 'كسرة', harakahEn: 'Kasra', options: ['غِ', 'عَ', 'عِ', 'عُ'] },
    { targetChar: 'ظُ', soundLabelAr: 'ظاء مضمومة (ظُ)', soundLabelEn: 'Dha with Damma (Dhu)', harakahAr: 'ضمة', harakahEn: 'Damma', options: ['طُ', 'ذُ', 'ظُ', 'زُ'] },
    { targetChar: 'يَ', soundLabelAr: 'ياء مفتوحة (يَ)', soundLabelEn: 'Yaa with Fatha (Ya)', harakahAr: 'فتحة', harakahEn: 'Fatha', options: ['يِ', 'يُ', 'يَ', 'بَ'] },
  ],
];

export function NoorLettersGame({ onExit }: { onExit: () => void }) {
  const { lang, user, toast } = useApp();
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [levelIdx, setLevelIdx] = useState(0);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [hearts, setHearts] = useState(3);
  const [muted, setMuted] = useState(soundFX.muted);
  const [feedback, setFeedback] = useState<'idle' | 'correct' | 'wrong'>('idle');

  const isGuestSampleOnly = !user || user.role !== 'student';
  const maxAllowedLevels = isGuestSampleOnly ? 1 : LEVELS.length;
  const currentLevel = LEVELS[levelIdx];
  const currentQ = currentLevel[questionIdx];

  const toggleMute = () => {
    soundFX.muted = !muted;
    setMuted(!muted);
  };

  const persistProgress = useCallback(
    async (finalScore: number, completedLevelCount: number) => {
      if (user?.role === 'student') {
        const stars = finalScore >= 300 ? 9 : finalScore >= 180 ? 6 : 3;
        try {
          await apiFetch('/api/student/games/progress', {
            method: 'POST',
            body: JSON.stringify({
              game_slug: 'noor-letters',
              score: finalScore,
              stars,
              completed_levels: completedLevelCount,
            }),
          });
        } catch {
          // silent background save
        }
      }
    },
    [user]
  );

  const startGame = useCallback(() => {
    soundFX.playClick();
    setLevelIdx(0);
    setQuestionIdx(0);
    setScore(0);
    setHearts(3);
    setFeedback('idle');
    setGameState('PLAYING');
  }, []);

  const handleAnswer = useCallback(
    (choice: string) => {
      if (gameState !== 'PLAYING' || feedback !== 'idle') return;
      if (choice === currentQ.targetChar) {
        soundFX.playSuccess();
        setFeedback('correct');
        const nextScore = score + 30;
        setScore(nextScore);

        setTimeout(() => {
          setFeedback('idle');
          if (questionIdx + 1 < currentLevel.length) {
            setQuestionIdx((q) => q + 1);
          } else if (levelIdx + 1 < maxAllowedLevels) {
            persistProgress(nextScore, levelIdx + 1);
            setGameState('ROUND_SUMMARY');
          } else {
            persistProgress(nextScore, levelIdx + 1);
            setGameState('GAME_OVER');
            if (isGuestSampleOnly) {
              toast(
                lang === 'ar'
                  ? 'أكملت الجولة التجريبية! سجّل كطالب لفتح جميع المستويات.'
                  : 'Sample round complete! Sign in as a student to unlock all levels.',
                'info'
              );
            }
          }
        }, 420);
      } else {
        soundFX.playError();
        setFeedback('wrong');
        const nextHearts = hearts - 1;
        setHearts(nextHearts);
        setTimeout(() => {
          setFeedback('idle');
          if (nextHearts <= 0) {
            persistProgress(score, levelIdx + 1);
            setGameState('GAME_OVER');
          }
        }, 420);
      }
    },
    [gameState, feedback, currentQ, score, questionIdx, currentLevel.length, levelIdx, maxAllowedLevels, hearts, persistProgress, isGuestSampleOnly, lang, toast]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (gameState === 'PLAYING') setGameState('PAUSED');
        else if (gameState === 'PAUSED') setGameState('PLAYING');
      } else if (gameState === 'TITLE_MENU' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        startGame();
      } else if (gameState === 'PLAYING' && ['1', '2', '3', '4'].includes(e.key)) {
        const idx = Number(e.key) - 1;
        if (currentQ.options[idx]) handleAnswer(currentQ.options[idx]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gameState, currentQ, handleAnswer, startGame]);

  return (
    <div className="fixed inset-0 z-50 bg-[#0A192F] text-[#F8F5EC] flex flex-col select-none">
      {/* Top Perimeter HUD */}
      <div className="flex items-center justify-between px-4 sm:px-8 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
            <span>{lang === 'ar' ? 'خروج' : 'Exit'}</span>
          </button>
          <span className="text-sm font-semibold text-amber-300">
            {lang === 'ar' ? 'صائد الحروف والحركات' : 'Noor Letters & Harakat'}
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm font-mono-tabular">
          <span>
            {lang === 'ar' ? 'المستوى' : 'Lvl'} {levelIdx + 1}/{maxAllowedLevels}
          </span>
          <span className="text-amber-300 font-bold">
            ★ {score}
          </span>
          <span className="text-rose-300">
            {'♥ '.repeat(Math.max(hearts, 0)).trim() || '0'}
          </span>
          <button
            onClick={toggleMute}
            aria-label="Mute toggle"
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          {gameState === 'PLAYING' && (
            <button
              onClick={() => setGameState('PAUSED')}
              aria-label="Pause"
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 cursor-pointer"
            >
              <Pause className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Playfield */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        {gameState === 'TITLE_MENU' && (
          <div className="max-w-lg w-full text-center space-y-6">
            <svg viewBox="0 0 120 120" className="w-24 h-24 mx-auto" aria-hidden="true">
              <circle cx="60" cy="60" r="54" fill="#13294B" stroke="#D99B26" strokeWidth="3" />
              <text x="60" y="74" textAnchor="middle" fill="#F8F5EC" fontSize="48" fontWeight="bold">نُ</text>
            </svg>
            <h1 className="text-3xl sm:text-4xl font-bold text-balance">
              {lang === 'ar' ? 'صائد الحروف والحركات' : 'Noor Letters & Harakat'}
            </h1>
            <p className="text-slate-300 text-base leading-relaxed">
              {lang === 'ar'
                ? 'اقرأ اسم الحرف والحركة المطلوبة ثم اختر البطاقة المطابقة لجمع نجوم النور.'
                : 'Read the requested Arabic letter and vowel mark (Harakah), then tap the matching card.'}
            </p>
            <p className="text-xs text-slate-400">
              {lang === 'ar'
                ? 'التحكم: النقر أو مفاتيح 1–4 · Esc للإيقاف المؤقت'
                : 'Controls: Click/Tap or Keys 1–4 · Esc to Pause'}
            </p>
            <button
              onClick={startGame}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-8 py-3.5 text-base font-bold bg-[#C98A1E] hover:bg-[#B47A16] text-white transition-colors cursor-pointer"
            >
              <Play className="w-5 h-5" />
              <span>{lang === 'ar' ? 'ابدأ اللعب' : 'Start Game'}</span>
            </button>
          </div>
        )}

        {gameState === 'PLAYING' && (
          <div className="max-w-2xl w-full space-y-8 text-center">
            <div className="space-y-2">
              <div className="text-xs text-teal-300 font-medium">
                {lang === 'ar' ? `السؤال ${questionIdx + 1} من ${currentLevel.length}` : `Question ${questionIdx + 1} of ${currentLevel.length}`}
                {' · '}
                {lang === 'ar' ? currentQ.harakahAr : currentQ.harakahEn}
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-amber-300">
                {lang === 'ar' ? currentQ.soundLabelAr : currentQ.soundLabelEn}
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:gap-6">
              {currentQ.options.map((opt, idx) => (
                <button
                  key={opt + idx}
                  onClick={() => handleAnswer(opt)}
                  className={`min-h-[112px] rounded-2xl border-2 text-5xl sm:text-6xl font-bold transition-transform duration-150 active:scale-95 cursor-pointer flex flex-col items-center justify-center gap-2 ${
                    feedback === 'correct' && opt === currentQ.targetChar
                      ? 'bg-teal-700 border-teal-400 text-white scale-[1.03]'
                      : feedback === 'wrong' && opt !== currentQ.targetChar
                      ? 'bg-[#13294B] border-[#264575] text-white/80'
                      : 'bg-[#13294B] hover:bg-[#1A3661] border-[#294A7D] text-[#F8F5EC]'
                  }`}
                >
                  <span>{opt}</span>
                  <span className="text-xs font-mono-tabular text-slate-400">{idx + 1}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {gameState === 'PAUSED' && (
          <div className="max-w-sm w-full rounded-2xl bg-[#13294B] border border-[#294A7D] p-8 text-center space-y-5">
            <h2 className="text-2xl font-bold">{lang === 'ar' ? 'إيقاف مؤقت' : 'Game Paused'}</h2>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => setGameState('PLAYING')}
                className="rounded-xl px-5 py-3 font-bold bg-[#C98A1E] hover:bg-[#B47A16] text-white cursor-pointer"
              >
                {lang === 'ar' ? 'متابعة' : 'Resume'}
              </button>
              <button
                onClick={startGame}
                className="rounded-xl px-5 py-3 font-semibold bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                {lang === 'ar' ? 'إعادة من البداية' : 'Restart'}
              </button>
            </div>
          </div>
        )}

        {gameState === 'ROUND_SUMMARY' && (
          <div className="max-w-md w-full rounded-2xl bg-[#13294B] border border-[#294A7D] p-8 text-center space-y-5">
            <Star className="w-12 h-12 text-amber-300 mx-auto" />
            <h2 className="text-2xl font-bold">
              {lang === 'ar' ? `أحسنت! أنهيت المستوى ${levelIdx + 1}` : `Well done! Level ${levelIdx + 1} Complete`}
            </h2>
            <p className="text-slate-300 tabular-nums">
              {lang === 'ar' ? `الرصيد الحالي: ${score} نقطة` : `Current Score: ${score} pts`}
            </p>
            <button
              onClick={() => {
                setLevelIdx((l) => l + 1);
                setQuestionIdx(0);
                setGameState('PLAYING');
              }}
              className="w-full rounded-xl px-6 py-3 font-bold bg-teal-600 hover:bg-teal-500 text-white cursor-pointer"
            >
              {lang === 'ar' ? 'المستوى التالي' : 'Next Level'}
            </button>
          </div>
        )}

        {gameState === 'GAME_OVER' && (
          <div className="max-w-md w-full rounded-2xl bg-[#13294B] border border-[#294A7D] p-8 text-center space-y-5">
            <Star className="w-12 h-12 text-amber-300 mx-auto" />
            <h2 className="text-2xl font-bold">
              {hearts > 0
                ? lang === 'ar'
                  ? 'مبارك! أتممت التحدي'
                  : 'Challenge Completed!'
                : lang === 'ar'
                ? 'انتهت المحاولات، أحسنت المحاولة!'
                : 'Round Ended — Great Effort!'}
            </h2>
            <div className="text-3xl font-bold font-mono-tabular text-amber-300">{score}</div>
            {isGuestSampleOnly && (
              <p className="text-xs text-teal-200">
                {lang === 'ar'
                  ? 'هذه عينة للزوار (المستوى 1). سجّل دخولك كطالب لحفظ تقدمك وفتح المستويات الثلاثة.'
                  : 'Visitor sample mode (Level 1). Sign in as a student to unlock all 3 levels and save progress.'}
              </p>
            )}
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={startGame}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-3 font-bold bg-[#C98A1E] hover:bg-[#B47A16] text-white cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{lang === 'ar' ? 'العب مجدداً' : 'Play Again'}</span>
              </button>
              <button
                onClick={onExit}
                className="rounded-xl px-5 py-3 font-semibold bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                {lang === 'ar' ? 'عودة' : 'Exit'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
