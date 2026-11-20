import React, { useState, useCallback } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import {
  Gamepad2,
  ArrowLeft,
  Users,
  Shield,
  Heart,
  Trophy,
  RotateCcw,
  Play,
  Dice5,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

interface GameItem {
  id: 'whot' | 'ludo' | 'trivia' | 'tictactoe' | 'fight-arena' | 'billiards' | 'bb-racing';
  name: string;
  tagline: string;
  summary: string;
  players: string;
  badgeBg: string;
  badgeText: string;
  icon: string;
  features: string[];
  playableWebId?: 'whot' | 'ludo' | 'trivia' | 'tictactoe';
}

const CAMPUS_GAMES: GameItem[] = [
  {
    id: 'whot',
    name: 'Naija WHOT!',
    tagline: 'Classic Nigerian card duel rebuilt for hostel & faculty breaks',
    summary:
      'Match suit or number against ABSU Bot, deploy Pick Two or Hold On, and call a suit with WHOT 20.',
    players: 'Solo vs CPU · Native 2-4P on Android',
    badgeBg: 'bg-purple-500/10 text-purple-500 border border-purple-500/20',
    badgeText: 'Playable Now',
    icon: '🃏',
    features: ['Suit & Number Match', 'Pick Two & Hold On', 'WHOT 20 Wildcard', 'Instant Scoreboard'],
    playableWebId: 'whot',
  },
  {
    id: 'ludo',
    name: 'Campus Ludo Dice Race',
    tagline: 'Sprint your token across Uturu campus to reach the Finish Gate first',
    summary:
      'Roll the dice, earn bonus rolls on 6, capture opponent momentum, and cross square 20 exactly or cleanly.',
    players: 'Solo vs CPU · Native 4P on Android',
    badgeBg: 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20',
    badgeText: 'Playable Now',
    icon: '🎲',
    features: ['Roll 6 Bonus Turn', 'Boost & Slip Squares', 'Race Progress Bar', 'Low-Data Engine'],
    playableWebId: 'ludo',
  },
  {
    id: 'trivia',
    name: 'ABSU Campus Trivia',
    tagline: 'Test your knowledge of Abia State University & Nigerian campus culture',
    summary:
      'Quick-fire 5-question round covering ABSU faculties, Uturu history, GST essentials, and campus life.',
    players: 'Solo Quiz · Campus Leaderboard',
    badgeBg: 'bg-blue-500/10 text-blue-500 border border-blue-500/20',
    badgeText: 'Playable Now',
    icon: '🎓',
    features: ['ABSU & Uturu Lore', 'Instant Explanations', 'Streak Scoring', 'Quick 60s Round'],
    playableWebId: 'trivia',
  },
  {
    id: 'tictactoe',
    name: 'Shuttle Stop X & O',
    tagline: 'Fast 3x3 tactical duel between lectures',
    summary:
      'Challenge Campus AI on a clean 3x3 grid with win/draw streak tracking and instant rematches.',
    players: 'Solo vs Smart CPU',
    badgeBg: 'bg-amber-500/10 text-amber-500 border border-amber-500/20',
    badgeText: 'Playable Now',
    icon: '❌',
    features: ['Smart CPU Blocking', 'Win Streak Tracker', 'Zero Lag Rounds', '1-Tap Rematch'],
    playableWebId: 'tictactoe',
  },
  {
    id: 'fight-arena',
    name: 'ABSU Fight Arena',
    tagline: 'Campus combat duel arena with special moves & combos',
    summary:
      'Full 3D-styled combat engine with custom fighters, weapon masteries, and 1v1 duels in the Native Android App.',
    players: 'Native Android Engine',
    badgeBg: 'bg-violet-500/10 text-violet-500 border border-violet-500/20',
    badgeText: 'Native Android',
    icon: '🥷',
    features: ['6 Original Fighters', 'Custom Weapons & Skills', '1v1 Direct Duels', '60fps Native Engine'],
  },
  {
    id: 'billiards',
    name: 'ABSU Billiards',
    tagline: 'Challenge a classmate to a precision 8-ball pool match',
    summary:
      'Physics-driven cue aim, spin power, solids vs stripes rules, and 8-ball pocket detection in the Native Android App.',
    players: 'Native Android Engine',
    badgeBg: 'bg-teal-500/10 text-teal-500 border border-teal-500/20',
    badgeText: 'Native Android',
    icon: '🎱',
    features: ['Touch Aim & Power Cue', 'Solids vs Stripes', 'Foul & Ball-in-Hand', 'Multiplayer Sync'],
  },
  {
    id: 'bb-racing',
    name: 'ABSU Kart Racing',
    tagline: 'Race your friends around the Uturu campus circuit',
    summary:
      'Steer, drift through corners, and hit nitro boosts around ABSU landmark circuits in the Native Android App.',
    players: 'Native Android Engine',
    badgeBg: 'bg-orange-500/10 text-orange-500 border border-orange-500/20',
    badgeText: 'Native Android',
    icon: '🏎️',
    features: ['Uturu Campus Track', 'Drift & Nitro Boost', 'Lap Timing', 'Custom Karts'],
  },
];

// --- Mini-Game 1: Naija WHOT! ---
type WhotSuit = 'Circle' | 'Triangle' | 'Cross' | 'Square' | 'Star';
interface WhotCard {
  id: string;
  suit: WhotSuit | 'Whot';
  num: number;
}
const SUIT_SYMBOLS: Record<WhotSuit | 'Whot', string> = {
  Circle: '●',
  Triangle: '▲',
  Cross: '✚',
  Square: '■',
  Star: '★',
  Whot: 'W',
};

function createWhotDeck(): WhotCard[] {
  const suits: WhotSuit[] = ['Circle', 'Triangle', 'Cross', 'Square', 'Star'];
  const nums = [1, 2, 3, 5, 7, 8, 10, 11, 13, 14];
  const deck: WhotCard[] = [];
  for (const s of suits) {
    for (const n of nums) {
      deck.push({ id: `${s}-${n}`, suit: s, num: n });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ id: `Whot-20-${i}`, suit: 'Whot', num: 20 });
  }
  return deck.sort(() => Math.random() - 0.5);
}

const MiniWhotGame: React.FC<{ onWin: () => void }> = ({ onWin }) => {
  const initState = () => {
    const deck = createWhotDeck();
    const player = deck.slice(0, 5);
    const cpu = deck.slice(5, 10);
    const firstNonWhotIdx = deck.findIndex((c, idx) => idx >= 10 && c.suit !== 'Whot');
    const top = deck[firstNonWhotIdx >= 10 ? firstNonWhotIdx : 10];
    const rest = deck.filter((_, idx) => idx >= 10 && idx !== firstNonWhotIdx);
    return { deck: rest, player, cpu, top };
  };

  const [state, setState] = useState(initState);
  const [activeSuit, setActiveSuit] = useState<WhotSuit>(
    state.top.suit === 'Whot' ? 'Circle' : state.top.suit
  );
  const [status, setStatus] = useState('Your turn! Match suit or number, or play WHOT 20.');
  const [pickingSuit, setPickingSuit] = useState(false);
  const [winner, setWinner] = useState<'player' | 'cpu' | null>(null);

  const reset = () => {
    const next = initState();
    setState(next);
    setActiveSuit(next.top.suit === 'Whot' ? 'Circle' : next.top.suit);
    setStatus('New match started! Your turn.');
    setPickingSuit(false);
    setWinner(null);
  };

  const runCpuTurn = useCallback(
    (
      currentDeck: WhotCard[],
      playerHand: WhotCard[],
      cpuHand: WhotCard[],
      topCard: WhotCard,
      suitToMatch: WhotSuit,
      extraDrawForCpu = 0
    ) => {
      let deckCopy = [...currentDeck];
      let cpuCopy = [...cpuHand];
      if (extraDrawForCpu > 0) {
        const drawn = deckCopy.slice(0, extraDrawForCpu);
        deckCopy = deckCopy.slice(extraDrawForCpu);
        cpuCopy = [...cpuCopy, ...drawn];
      }
      const playableIdx = cpuCopy.findIndex(
        (c) => c.suit === 'Whot' || c.suit === suitToMatch || c.num === topCard.num
      );
      if (playableIdx === -1) {
        if (deckCopy.length === 0) {
          setStatus('Deck empty! Your turn.');
          setState({ deck: deckCopy, player: playerHand, cpu: cpuCopy, top: topCard });
          return;
        }
        const drawn = deckCopy[0];
        deckCopy = deckCopy.slice(1);
        cpuCopy.push(drawn);
        setState({ deck: deckCopy, player: playerHand, cpu: cpuCopy, top: topCard });
        setStatus('ABSU Bot went to market and drew a card. Your turn!');
        return;
      }

      const played = cpuCopy[playableIdx];
      cpuCopy.splice(playableIdx, 1);
      if (cpuCopy.length === 0) {
        setState({ deck: deckCopy, player: playerHand, cpu: cpuCopy, top: played });
        setWinner('cpu');
        setStatus('ABSU Bot called LAST CARD & Check Up!');
        return;
      }

      let nextSuit: WhotSuit =
        played.suit === 'Whot'
          ? (['Circle', 'Triangle', 'Cross', 'Square', 'Star'].find((s) =>
              cpuCopy.some((c) => c.suit === s)
            ) as WhotSuit) || 'Circle'
          : played.suit;

      let updatedPlayer = [...playerHand];
      let msg = `Bot played ${played.suit === 'Whot' ? `WHOT 20 (needs ${nextSuit})` : `${played.suit} ${played.num}`}.`;
      if (played.num === 2 && deckCopy.length >= 2) {
        updatedPlayer = [...updatedPlayer, ...deckCopy.slice(0, 2)];
        deckCopy = deckCopy.slice(2);
        msg = `Bot played ${played.suit} 2 — Pick Two!`;
      } else if (played.num === 14 && deckCopy.length >= 1) {
        updatedPlayer = [...updatedPlayer, deckCopy[0]];
        deckCopy = deckCopy.slice(1);
        msg = `Bot played ${played.suit} 14 — General Market (+1)!`;
      }
      setActiveSuit(nextSuit);
      setState({ deck: deckCopy, player: updatedPlayer, cpu: cpuCopy, top: played });
      setStatus(`${msg} Your turn!`);
    },
    []
  );

  const playCard = (card: WhotCard) => {
    if (winner || pickingSuit) return;
    const canPlay = card.suit === 'Whot' || card.suit === activeSuit || card.num === state.top.num;
    if (!canPlay) {
      setStatus(`Cannot play ${card.suit} ${card.num}. Match ${activeSuit} or ${state.top.num}.`);
      return;
    }

    const nextPlayer = state.player.filter((c) => c.id !== card.id);
    if (nextPlayer.length === 0) {
      setState({ ...state, player: nextPlayer, top: card });
      setWinner('player');
      setStatus('CHECK UP! You won the Naija WHOT! match!');
      onWin();
      return;
    }

    if (card.suit === 'Whot') {
      setState({ ...state, player: nextPlayer, top: card });
      setPickingSuit(true);
      setStatus('WHOT 20! Choose the next shape:');
      return;
    }

    const nextSuit = card.suit;
    setActiveSuit(nextSuit);

    if (card.num === 1) {
      setState({ ...state, player: nextPlayer, top: card });
      setStatus('Hold On (1)! Play another card.');
      return;
    }

    const extraCpu = card.num === 2 ? 2 : card.num === 14 ? 1 : 0;
    runCpuTurn(state.deck, nextPlayer, state.cpu, card, nextSuit, extraCpu);
  };

  const drawFromMarket = () => {
    if (winner || pickingSuit) return;
    if (state.deck.length === 0) {
      setStatus('Market deck exhausted! Skipping turn to Bot.');
      runCpuTurn(state.deck, state.player, state.cpu, state.top, activeSuit);
      return;
    }
    const drawn = state.deck[0];
    const nextDeck = state.deck.slice(1);
    const nextPlayer = [...state.player, drawn];
    runCpuTurn(nextDeck, nextPlayer, state.cpu, state.top, activeSuit);
  };

  const chooseWhotSuit = (suit: WhotSuit) => {
    setPickingSuit(false);
    setActiveSuit(suit);
    runCpuTurn(state.deck, state.player, state.cpu, state.top, suit);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-bold text-[var(--color-text-primary)]">
          Bot Cards: {state.cpu.length} · Market: {state.deck.length}
        </span>
        <button
          onClick={reset}
          className="px-2.5 py-1 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] font-semibold flex items-center gap-1 hover:border-[var(--color-primary)]/50"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
      </div>

      <div className="p-3 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-20 rounded-xl bg-[var(--color-primary)] text-white flex flex-col items-center justify-center shadow-md font-extrabold">
            <span className="text-xl">{SUIT_SYMBOLS[state.top.suit]}</span>
            <span className="text-sm">{state.top.num}</span>
          </div>
          <div>
            <p className="text-xs font-bold text-[var(--color-text-primary)]">
              Active Suit: {activeSuit} ({SUIT_SYMBOLS[activeSuit]})
            </p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{status}</p>
          </div>
        </div>
        <button
          onClick={drawFromMarket}
          disabled={Boolean(winner) || pickingSuit}
          className="px-3 py-2 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-xs font-bold hover:bg-amber-500/25 disabled:opacity-50 shrink-0"
        >
          Go Market (+1)
        </button>
      </div>

      {pickingSuit && (
        <div className="flex flex-wrap gap-2">
          {(['Circle', 'Triangle', 'Cross', 'Square', 'Star'] as WhotSuit[]).map((suit) => (
            <button
              key={suit}
              onClick={() => chooseWhotSuit(suit)}
              className="px-3 py-1.5 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold"
            >
              {SUIT_SYMBOLS[suit]} {suit}
            </button>
          ))}
        </div>
      )}

      <div>
        <p className="text-xs font-bold text-[var(--color-text-secondary)] mb-2">
          Your Hand ({state.player.length} cards)
        </p>
        <div className="flex flex-wrap gap-2">
          {state.player.map((card) => {
            const playable =
              !winner &&
              !pickingSuit &&
              (card.suit === 'Whot' || card.suit === activeSuit || card.num === state.top.num);
            return (
              <button
                key={card.id}
                onClick={() => playCard(card)}
                disabled={!playable}
                className={`w-14 h-20 rounded-xl border flex flex-col items-center justify-center transition-all ${
                  playable
                    ? 'bg-[var(--color-bg-card)] border-[var(--color-primary)] text-[var(--color-text-primary)] hover:-translate-y-1 shadow-sm'
                    : 'bg-[var(--color-bg-main)] border-[var(--color-border)] text-[var(--color-text-secondary)] opacity-60'
                }`}
              >
                <span className="text-lg">{SUIT_SYMBOLS[card.suit]}</span>
                <span className="text-xs font-extrabold">{card.num}</span>
                <span className="text-[9px] truncate max-w-[48px]">{card.suit}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// --- Mini-Game 2: Campus Ludo Dice Race ---
const MiniLudoRace: React.FC<{ onWin: () => void }> = ({ onWin }) => {
  const [playerPos, setPlayerPos] = useState(0);
  const [cpuPos, setCpuPos] = useState(0);
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const [turnInfo, setTurnInfo] = useState('Roll the dice to race from Hostel Gate (0) to Lecture Hall (20)!');
  const [winner, setWinner] = useState<'player' | 'cpu' | null>(null);

  const roll = () => {
    if (winner) return;
    const d = Math.floor(Math.random() * 6) + 1;
    setLastRoll(d);
    let nextP = Math.min(20, playerPos + d);
    let extraNote = '';
    if (nextP === 7 || nextP === 14) {
      nextP = Math.min(20, nextP + 2);
      extraNote = ' Safe Shuttle Boost (+2)!';
    }
    setPlayerPos(nextP);

    if (nextP >= 20) {
      setWinner('player');
      setTurnInfo(`You rolled ${d}${extraNote} and crossed square 20 first! Victory!`);
      onWin();
      return;
    }

    if (d === 6) {
      setTurnInfo(`You rolled 6!${extraNote} Bonus turn — roll again!`);
      return;
    }

    const cpuD = Math.floor(Math.random() * 6) + 1;
    const nextC = Math.min(20, cpuPos + cpuD);
    setCpuPos(nextC);
    if (nextC >= 20) {
      setWinner('cpu');
      setTurnInfo(`You rolled ${d}${extraNote}. Bot rolled ${cpuD} and reached square 20!`);
    } else {
      setTurnInfo(`You rolled ${d}${extraNote}. Bot rolled ${cpuD} (now at ${nextC}/20).`);
    }
  };

  const reset = () => {
    setPlayerPos(0);
    setCpuPos(0);
    setLastRoll(null);
    setWinner(null);
    setTurnInfo('Fresh race ready! Roll the dice.');
  };

  return (
    <div className="space-y-4">
      <div className="p-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] space-y-3">
        <div>
          <div className="flex justify-between text-xs font-bold mb-1">
            <span className="text-[var(--color-primary)]">You: {playerPos}/20</span>
            <span className="text-emerald-500">Finish Gate</span>
          </div>
          <div className="h-3 rounded-full bg-[var(--color-bg-card)] border border-[var(--color-border)] overflow-hidden">
            <div
              className="h-full bg-[var(--color-primary)] transition-all"
              style={{ width: `${(playerPos / 20) * 100}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs font-bold mb-1">
            <span className="text-amber-500">ABSU Bot: {cpuPos}/20</span>
          </div>
          <div className="h-3 rounded-full bg-[var(--color-bg-card)] border border-[var(--color-border)] overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all"
              style={{ width: `${(cpuPos / 20) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <p className="text-xs text-[var(--color-text-secondary)]">{turnInfo}</p>

      <div className="flex items-center gap-2">
        <button
          onClick={roll}
          disabled={Boolean(winner)}
          className="px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold flex items-center gap-2 hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
        >
          <Dice5 className="w-4 h-4" />
          <span>{lastRoll ? `Roll Again (Last: ${lastRoll})` : 'Roll Dice'}</span>
        </button>
        <button
          onClick={reset}
          className="px-3 py-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-xs font-semibold flex items-center gap-1"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
      </div>
    </div>
  );
};

// --- Mini-Game 3: ABSU Campus Trivia ---
const TRIVIA_QUESTIONS = [
  {
    q: 'Where is the main campus of Abia State University (ABSU) located?',
    options: ['Umuahia', 'Uturu', 'Aba', 'Ohafia'],
    answer: 1,
  },
  {
    q: 'Which ABSU campus houses the Teaching Hospital and Clinical Medicine programs?',
    options: ['Uturu Main Campus', 'Aba Campus', 'Umuahia Law Campus', 'Bende Annex'],
    answer: 1,
  },
  {
    q: 'What does the card number 2 mean in classic Naija WHOT!?',
    options: ['General Market', 'Hold On', 'Pick Two', 'Suspension'],
    answer: 2,
  },
  {
    q: 'What year was Abia State University established (originally as Imo State University, Etiti)?',
    options: ['1975', '1981', '1991', '1999'],
    answer: 1,
  },
  {
    q: 'Which card allows a player to call any shape in Naija WHOT!?',
    options: ['14', '8', '20', '1'],
    answer: 2,
  },
];

const MiniTriviaGame: React.FC<{ onWin: () => void }> = ({ onWin }) => {
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);

  const current = TRIVIA_QUESTIONS[idx];

  const handleSelect = (optIdx: number) => {
    if (selected !== null) return;
    setSelected(optIdx);
    const isCorrect = optIdx === current.answer;
    const nextScore = isCorrect ? score + 1 : score;
    if (isCorrect) setScore(nextScore);

    setTimeout(() => {
      if (idx + 1 >= TRIVIA_QUESTIONS.length) {
        setFinished(true);
        if (nextScore >= 3) onWin();
      } else {
        setIdx((i) => i + 1);
        setSelected(null);
      }
    }, 750);
  };

  const reset = () => {
    setIdx(0);
    setScore(0);
    setSelected(null);
    setFinished(false);
  };

  if (finished) {
    return (
      <div className="p-4 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-center space-y-2">
        <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
        <h4 className="text-sm font-extrabold text-[var(--color-text-primary)]">
          Round Complete: {score} / {TRIVIA_QUESTIONS.length}
        </h4>
        <p className="text-xs text-[var(--color-text-secondary)]">
          {score >= 4 ? 'True Uturu Scholar!' : 'Great warm-up — play again to beat your score.'}
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold"
        >
          Play Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between text-xs font-bold text-[var(--color-text-secondary)]">
        <span>
          Question {idx + 1} of {TRIVIA_QUESTIONS.length}
        </span>
        <span className="text-[var(--color-primary)]">Score: {score}</span>
      </div>
      <p className="text-sm font-bold text-[var(--color-text-primary)]">{current.q}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {current.options.map((opt, i) => {
          let cls = 'bg-[var(--color-bg-main)] border-[var(--color-border)] text-[var(--color-text-primary)]';
          if (selected !== null) {
            if (i === current.answer) cls = 'bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400';
            else if (i === selected) cls = 'bg-rose-500/15 border-rose-500 text-rose-500';
          }
          return (
            <button
              key={opt}
              onClick={() => handleSelect(i)}
              className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition-colors ${cls}`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// --- Mini-Game 4: Shuttle Stop Tic-Tac-Toe ---
function checkTttWinner(board: Array<'X' | 'O' | null>): 'X' | 'O' | 'draw' | null {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return board.every(Boolean) ? 'draw' : null;
}

const MiniTicTacToe: React.FC<{ onWin: () => void }> = ({ onWin }) => {
  const [board, setBoard] = useState<Array<'X' | 'O' | null>>(Array(9).fill(null));
  const result = checkTttWinner(board);

  const handleMove = (idx: number) => {
    if (board[idx] || result) return;
    const next = [...board];
    next[idx] = 'X';
    const afterPlayer = checkTttWinner(next);
    if (afterPlayer) {
      setBoard(next);
      if (afterPlayer === 'X') onWin();
      return;
    }
    const emptyIndices = next.map((v, i) => (v === null ? i : -1)).filter((i) => i !== -1);
    if (emptyIndices.length > 0) {
      const cpuChoice = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
      next[cpuChoice] = 'O';
    }
    setBoard(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold text-[var(--color-text-primary)]">
          {result === 'X'
            ? 'You (X) won!'
            : result === 'O'
            ? 'ABSU Bot (O) won!'
            : result === 'draw'
            ? 'Draw match!'
            : 'Your move (X)'}
        </span>
        <button
          onClick={() => setBoard(Array(9).fill(null))}
          className="px-2.5 py-1 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] font-semibold flex items-center gap-1"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 max-w-[220px]">
        {board.map((cell, i) => (
          <button
            key={i}
            onClick={() => handleMove(i)}
            className="h-16 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] text-lg font-extrabold text-[var(--color-text-primary)] hover:border-[var(--color-primary)]/50 transition-colors"
          >
            {cell}
          </button>
        ))}
      </div>
    </div>
  );
};

export const GameCenterView: React.FC = () => {
  const { goBack, addToast } = useApp();
  const [likedGames, setLikedGames] = useState<Record<string, boolean>>({});
  const [activeArcade, setActiveArcade] = useState<'whot' | 'ludo' | 'trivia' | 'tictactoe'>('whot');
  const [wins, setWins] = useState(0);

  const handleToggleLike = (gameId: string, gameName: string) => {
    setLikedGames((prev) => {
      const next = !prev[gameId];
      if (next) addToast(`Saved ${gameName} to favorites`, 'info');
      return { ...prev, [gameId]: next };
    });
  };

  const handleWin = () => {
    setWins((w) => w + 1);
    addToast('Match victory recorded in your session!', 'success');
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Top Header Card */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-sm transition-colors">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={goBack}
              className="p-1.5 -ml-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded-xl min-w-[36px] min-h-[36px] flex items-center justify-center transition-colors hover:bg-[var(--color-bg-main)]"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--color-text-primary)]">
                  Game Center
                </h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                  Playable Arcade
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                Instant campus mini-games in browser + full 60fps native Android game engines.
              </p>
            </div>
          </div>

          <div className="px-3 py-1.5 rounded-xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)] text-xs font-extrabold flex items-center gap-1.5 shrink-0">
            <Trophy className="w-4 h-4" />
            <span>{wins} Wins</span>
          </div>
        </div>

        {/* Fair Play Notice */}
        <div className="mt-4 p-3.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border)] flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-subtle)] text-[var(--color-primary)] flex items-center justify-center shrink-0 mt-0.5">
            <Shield className="w-4 h-4" />
          </div>
          <div className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            <span className="font-bold text-[var(--color-text-primary)]">
              ABSU Student Fair Play:
            </span>{' '}
            All campus games are casual student recreations for leisure between peers. Zero real-money gambling, zero monetary stakes.
          </div>
        </div>
      </div>

      {/* Live Interactive Web Arcade */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-5 h-5 text-[var(--color-primary)]" />
            <h2 className="text-sm sm:text-base font-extrabold text-[var(--color-text-primary)]">
              Campus Web Arcade
            </h2>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'whot', label: 'Naija WHOT!' },
                { id: 'ludo', label: 'Ludo Race' },
                { id: 'trivia', label: 'ABSU Trivia' },
                { id: 'tictactoe', label: 'X & O' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveArcade(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  activeArcade === tab.id
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeArcade === 'whot' && <MiniWhotGame onWin={handleWin} />}
        {activeArcade === 'ludo' && <MiniLudoRace onWin={handleWin} />}
        {activeArcade === 'trivia' && <MiniTriviaGame onWin={handleWin} />}
        {activeArcade === 'tictactoe' && <MiniTicTacToe onWin={handleWin} />}
      </div>

      {/* Campus Catalog Cards */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
            Campus Game Roster ({CAMPUS_GAMES.length})
          </h2>
          <span className="text-[11px] text-[var(--color-text-secondary)] flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)]" />
            Web Arcade + Native APK
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {CAMPUS_GAMES.map((game) => {
            const isLiked = Boolean(likedGames[game.id]);
            return (
              <div
                key={game.id}
                className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between hover:border-[var(--color-primary)]/40 transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)] flex items-center justify-center text-2xl shadow-xs">
                        {game.icon}
                      </div>
                      <div>
                        <h3 className="font-extrabold text-sm sm:text-base text-[var(--color-text-primary)]">
                          {game.name}
                        </h3>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 ${game.badgeBg}`}>
                          {game.badgeText}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleToggleLike(game.id, game.name)}
                      className={`p-2 rounded-xl border transition-colors ${
                        isLiked
                          ? 'border-rose-500/30 bg-rose-500/10 text-rose-500'
                          : 'border-[var(--color-border)] hover:bg-[var(--color-bg-main)] text-[var(--color-text-secondary)]'
                      }`}
                      title="Save to favorites"
                    >
                      <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
                    </button>
                  </div>

                  <p className="text-xs font-semibold text-[var(--color-text-primary)] mt-3">
                    {game.tagline}
                  </p>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1.5 leading-relaxed">
                    {game.summary}
                  </p>

                  <div className="flex flex-wrap gap-1.5 mt-3.5">
                    {game.features.map((feat) => (
                      <span
                        key={feat}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-[var(--color-bg-main)] border border-[var(--color-border)] text-[var(--color-text-secondary)]"
                      >
                        ✓ {feat}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 pt-3.5 border-t border-[var(--color-border)] flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-1.5 text-[var(--color-text-secondary)] font-medium">
                    <Users className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                    <span>{game.players}</span>
                  </div>

                  {game.playableWebId ? (
                    <button
                      onClick={() => {
                        setActiveArcade(game.playableWebId!);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="px-3 py-1.5 rounded-xl bg-[var(--color-primary)] text-white text-[11px] font-bold flex items-center gap-1 hover:bg-[var(--color-primary-hover)] transition-colors"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Play Now</span>
                    </button>
                  ) : (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-[var(--color-primary-subtle)] text-[var(--color-primary)]">
                      Android APK Engine
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
