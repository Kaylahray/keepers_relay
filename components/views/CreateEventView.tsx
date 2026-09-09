'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { CoverPicker } from '@/components/CoverPicker';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { EventQuestionPoolStep } from '@/components/views/EventQuestionPoolStep';
import { useCreateEvent } from '@/hooks/useEvents';
import { useCommunitiesQuery } from '@/hooks/useCommunity';
import { useWallet } from '@/hooks/useWallet';
import { useMyBuilder } from '@/hooks/useBuilder';
import { useUsername } from '@/hooks/useUsername';
import { arenaCoverForSeed } from '@/lib/poster';
import { eventCellsLive } from '@/lib/relay/ckb';
import type {
  EventPlayRules,
  EventWinCondition,
  HostQuestionDraft,
  QuestionDifficulty,
  QuestionSource,
  QuestionType,
} from '@/types/event';
import { modeFromPlayRules } from '@/types/event';

const STEPS = [
  { id: 'basics', label: 'Basics', hint: 'Name & community' },
  { id: 'participation', label: 'Players', hint: 'Entry & seats' },
  { id: 'pot', label: 'Pot', hint: 'Prize pool' },
  { id: 'clock', label: 'Clock', hint: 'Turn pressure' },
  { id: 'challenge', label: 'Challenge', hint: 'Questions' },
  { id: 'scoring', label: 'Scoring', hint: 'Points' },
  { id: 'winner', label: 'Winner', hint: 'How it ends' },
  { id: 'review', label: 'Review', hint: 'Publish' },
] as const;

function questionsReady(pool: HostQuestionDraft[]): boolean {
  if (pool.length < 1) return false;
  return pool.every((q) => {
    const options = q.options.map((o) => o.trim()).filter(Boolean);
    return (
      q.prompt.trim().length > 0 &&
      options.length >= 2 &&
      q.correctIndex >= 0 &&
      q.correctIndex < q.options.length &&
      Boolean(q.options[q.correctIndex]?.trim())
    );
  });
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
        {label}
      </span>
      {hint ? <span className="mt-1 block text-xs text-white/40">{hint}</span> : null}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

const inputCls =
  'w-full border border-white/15 bg-black/40 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-[#99ee2d]';

function Choice({
  selected,
  title,
  note,
  onClick,
}: {
  selected: boolean;
  title: string;
  note: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border p-4 text-left transition ${
        selected
          ? 'border-[#99ee2d] bg-[#99ee2d]/12 text-white'
          : 'border-white/12 bg-black/30 text-white/75 hover:border-white/30'
      }`}
    >
      <span className="block font-poster text-xl uppercase leading-none">{title}</span>
      <span className="mt-2 block text-xs leading-relaxed text-white/50">{note}</span>
    </button>
  );
}

export function CreateEventView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkedCommunity = searchParams.get('community');
  const { address, isConnected, connect } = useWallet();
  const me = useMyBuilder().data?.builder;
  const { username } = useUsername();
  const create = useCreateEvent();
  const communities = useCommunitiesQuery();

  const [step, setStep] = useState(0);

  // 1 · Basics
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Knowledge');
  const [communityId, setCommunityId] = useState(linkedCommunity ?? '');
  const [coverImageUrl, setCoverImageUrl] = useState(arenaCoverForSeed('event'));

  // 2 · Participation
  const [entryFee, setEntryFee] = useState(10);
  const [minPlayers, setMinPlayers] = useState(2);
  const [maxPlayers, setMaxPlayers] = useState(8);

  // 3 · Pot
  const [startingPot, setStartingPot] = useState(50);
  const [contributionPerMove, setContributionPerMove] = useState(5);
  const [allowSponsorship, setAllowSponsorship] = useState(true);

  // 4 · Clock
  const [turnSecs, setTurnSecs] = useState(15);
  const [resetSecs, setResetSecs] = useState(15);
  const [minTurnSecs, setMinTurnSecs] = useState(5);
  const [clockBehavior, setClockBehavior] = useState<'reset' | 'shrink'>('reset');

  // 5 · Challenge
  const [questionSource, setQuestionSource] = useState<QuestionSource>('ai');
  const [questionType, setQuestionType] = useState<QuestionType>('multiple_choice');
  const [questionCount, setQuestionCount] = useState(12);
  const [topics, setTopics] = useState('ckb, nervos');
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>('medium');
  const [instructions, setInstructions] = useState('');
  const [questions, setQuestions] = useState<HostQuestionDraft[]>([]);

  // 6 · Scoring
  const [correctPoints, setCorrectPoints] = useState(1);
  const [wrongPenalty, setWrongPenalty] = useState(0);
  const [speedBonus, setSpeedBonus] = useState(false);

  // 7 · Winner
  const [winCondition, setWinCondition] = useState<EventWinCondition>('highest_score');
  const [winnersCount, setWinnersCount] = useState(2);

  const hostName = me?.displayName || username?.username || me?.username || 'Host';
  const poolOk = questionsReady(questions);
  const basicsOk = Boolean(name.trim() && description.trim());

  const ownedCommunities = useMemo(() => {
    const list = communities.data ?? [];
    if (!address) return list;
    return list.filter(
      (c) =>
        c.creatorAddress.toLowerCase() === address.toLowerCase() || c.id === linkedCommunity,
    );
  }, [communities.data, address, linkedCommunity]);

  const playRules: EventPlayRules = {
    growingPot: contributionPerMove > 0,
    winCondition,
    shrinkingClock: clockBehavior === 'shrink',
    accuracySpeed: speedBonus,
  };

  const selectedMode = modeFromPlayRules(playRules);

  function canJumpTo(index: number) {
    if (index === 0) return true;
    if (index >= 1 && !basicsOk) return false;
    if (index >= 5 && !poolOk && index !== 4) return false;
    if (index === 7 && !poolOk) return false;
    return index <= step + 1;
  }

  function goNext() {
    if (step === 0 && !basicsOk) return;
    if (step === 4 && !poolOk) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  function goBack() {
    setStep((s) => Math.max(0, s - 1));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step < STEPS.length - 1) {
      goNext();
      return;
    }
    if (!address || !basicsOk || !poolOk) return;

    create.mutate(
      {
        address,
        hostName,
        name,
        description,
        category,
        mode: selectedMode,
        playRules,
        topics: topics
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        difficulty,
        entryFee,
        startingPot,
        minPlayers,
        maxPlayers,
        turnSecs: clockBehavior === 'reset' ? resetSecs : turnSecs,
        shrinkStepSecs:
          clockBehavior === 'shrink'
            ? Math.max(1, Math.floor((turnSecs - minTurnSecs) / Math.max(1, maxPlayers)))
            : 0,
        minTurnSecs: clockBehavior === 'shrink' ? minTurnSecs : turnSecs,
        winnersCount: winCondition === 'last_standing' ? 1 : winnersCount,
        coverImageUrl,
        allowSponsorship,
        questionSource,
        questions,
        communityId: communityId || null,
      },
      {
        onSuccess: (event) => router.push(`/events/${event.id}/waiting`),
      },
    );
  }

  if (!isConnected) {
    return (
      <Shell>
        <div className="max-w-lg border border-white/10 bg-black/45 p-6">
          <p className="font-mono text-[11px] uppercase text-[#99ee2d]">Create event</p>
          <h1 className="mt-2 font-poster text-4xl uppercase text-white">One game. Your rules.</h1>
          <ArenaCta onClick={() => connect()} className="mt-8">
            Connect wallet to host
          </ArenaCta>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <form
        onSubmit={submit}
        className="grid gap-8 lg:grid-cols-[minmax(200px,240px)_minmax(0,1fr)]"
      >
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
            Create event
          </p>
          <h1 className="mt-2 font-poster text-3xl uppercase leading-none text-white">
            Configure
          </h1>
          <p className="mt-2 text-xs text-white/45">
            One multiplayer game. Rules are settings — not separate products.
          </p>

          <ol className="mt-8 space-y-0">
            {STEPS.map((item, index) => {
              const done = index < step;
              const active = index === step;
              const jumpable = canJumpTo(index);
              return (
                <li key={item.id} className="relative flex gap-3 pb-5 last:pb-0">
                  {index < STEPS.length - 1 ? (
                    <span
                      className={`absolute left-[13px] top-7 h-[calc(100%-0.75rem)] w-px ${
                        done ? 'bg-[#99ee2d]/50' : 'bg-white/10'
                      }`}
                      aria-hidden
                    />
                  ) : null}
                  <button
                    type="button"
                    disabled={!jumpable}
                    onClick={() => jumpable && setStep(index)}
                    className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center border text-[10px] font-bold ${
                      active
                        ? 'border-[#99ee2d] bg-[#99ee2d] text-[#111]'
                        : done
                          ? 'border-[#99ee2d]/50 text-[#99ee2d]'
                          : 'border-white/15 text-white/35'
                    } disabled:opacity-40`}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                  </button>
                  <button
                    type="button"
                    disabled={!jumpable}
                    onClick={() => jumpable && setStep(index)}
                    className="min-w-0 flex-1 text-left disabled:opacity-40"
                  >
                    <span
                      className={`block text-sm font-bold uppercase ${
                        active ? 'text-white' : 'text-white/55'
                      }`}
                    >
                      {item.label}
                    </span>
                    <span className="block font-mono text-[9px] uppercase text-white/35">
                      {item.hint}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <div className="min-w-0 border border-white/10 bg-black/40 p-5 sm:p-8">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
            Step {step + 1} / {STEPS.length}
          </p>
          <h2 className="mt-2 font-poster text-3xl uppercase text-white sm:text-4xl">
            {STEPS[step]?.label}
          </h2>

          <div className="mt-8 space-y-6">
            {step === 0 ? (
              <>
                <Field label="Event name">
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Naruto Pot Rush"
                    className={inputCls}
                    maxLength={80}
                  />
                </Field>
                <Field label="Description" hint="What are people playing for?">
                  <textarea
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Stake in, take turns, grow the pot, survive the clock."
                    className={`${inputCls} resize-none`}
                    maxLength={400}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Category">
                    <input
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className={inputCls}
                      maxLength={40}
                    />
                  </Field>
                  <Field
                    label="Community"
                    hint={
                      linkedCommunity
                        ? 'Linked from community page'
                        : 'Optional — owner-hosted communities only'
                    }
                  >
                    <select
                      value={communityId}
                      onChange={(e) => setCommunityId(e.target.value)}
                      className={inputCls}
                      disabled={Boolean(linkedCommunity)}
                    >
                      <option value="">Standalone event</option>
                      {ownedCommunities.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Cover">
                  <CoverPicker
                    value={coverImageUrl}
                    onChange={setCoverImageUrl}
                    seed={name || 'event'}
                  />
                </Field>
              </>
            ) : null}

            {step === 1 ? (
              <div className="grid gap-5 sm:grid-cols-3">
                <Field label="Entry (CKB)" hint="Stake to join">
                  <input
                    type="number"
                    min={0}
                    value={entryFee}
                    onChange={(e) => setEntryFee(Number(e.target.value))}
                    className={inputCls}
                  />
                </Field>
                <Field label="Minimum players">
                  <input
                    type="number"
                    min={2}
                    max={32}
                    value={minPlayers}
                    onChange={(e) => setMinPlayers(Number(e.target.value))}
                    className={inputCls}
                  />
                </Field>
                <Field label="Maximum players">
                  <input
                    type="number"
                    min={minPlayers}
                    max={64}
                    value={maxPlayers}
                    onChange={(e) => setMaxPlayers(Number(e.target.value))}
                    className={inputCls}
                  />
                </Field>
              </div>
            ) : null}

            {step === 2 ? (
              <>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Starting pot (CKB)" hint="Host seed into the prize">
                    <input
                      type="number"
                      min={0}
                      value={startingPot}
                      onChange={(e) => setStartingPot(Number(e.target.value))}
                      className={inputCls}
                    />
                  </Field>
                  <Field
                    label="Contribution per move (CKB)"
                    hint="0 = pot does not grow from moves"
                  >
                    <input
                      type="number"
                      min={0}
                      value={contributionPerMove}
                      onChange={(e) => setContributionPerMove(Number(e.target.value))}
                      className={inputCls}
                    />
                  </Field>
                </div>
                <label className="flex cursor-pointer items-start gap-3 border border-white/10 bg-black/30 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allowSponsorship}
                    onChange={(e) => setAllowSponsorship(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-bold uppercase text-white">
                      Allow sponsors
                    </span>
                    <span className="mt-1 block text-xs text-white/45">
                      Others can add CKB to the pot before or during the event.
                    </span>
                  </span>
                </label>
                <p className="font-mono text-[10px] uppercase text-white/35">
                  Display pot ≈ seed {startingPot} + entries + move growth
                  {contributionPerMove > 0 ? ` (+${contributionPerMove}/hit)` : ''}
                </p>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Choice
                    selected={clockBehavior === 'reset'}
                    title="Reset clock"
                    note="A valid move puts the turn timer back to the reset duration."
                    onClick={() => setClockBehavior('reset')}
                  />
                  <Choice
                    selected={clockBehavior === 'shrink'}
                    title="Shrinking turns"
                    note="Each round gets a shorter turn window. Pressure builds over time."
                    onClick={() => setClockBehavior('shrink')}
                  />
                </div>
                <div className="grid gap-5 sm:grid-cols-3">
                  <Field
                    label={clockBehavior === 'reset' ? 'Reset duration (sec)' : 'Starting turn (sec)'}
                  >
                    <input
                      type="number"
                      min={5}
                      max={120}
                      value={clockBehavior === 'reset' ? resetSecs : turnSecs}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (clockBehavior === 'reset') setResetSecs(n);
                        else setTurnSecs(n);
                      }}
                      className={inputCls}
                    />
                  </Field>
                  {clockBehavior === 'shrink' ? (
                    <Field label="Minimum duration (sec)">
                      <input
                        type="number"
                        min={3}
                        max={turnSecs}
                        value={minTurnSecs}
                        onChange={(e) => setMinTurnSecs(Number(e.target.value))}
                        className={inputCls}
                      />
                    </Field>
                  ) : (
                    <Field label="Turn duration (sec)" hint="Same as reset for this mode">
                      <input
                        type="number"
                        min={5}
                        max={120}
                        value={resetSecs}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setResetSecs(n);
                          setTurnSecs(n);
                        }}
                        className={inputCls}
                      />
                    </Field>
                  )}
                  <Field label="Scheduled feel" hint="Live lobby can still start early">
                    <p className="border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white/55">
                      Host starts when min players are in
                    </p>
                  </Field>
                </div>
              </>
            ) : null}

            {step === 4 ? (
              <EventQuestionPoolStep
                mode={selectedMode}
                turnSecs={turnSecs}
                source={questionSource}
                onSourceChange={setQuestionSource}
                questions={questions}
                onQuestionsChange={setQuestions}
                topic={topics}
                onTopicChange={setTopics}
                count={questionCount}
                onCountChange={setQuestionCount}
                difficulty={difficulty}
                onDifficultyChange={setDifficulty}
                questionType={questionType}
                onQuestionTypeChange={setQuestionType}
                instructions={instructions}
                onInstructionsChange={setInstructions}
              />
            ) : null}

            {step === 5 ? (
              <div className="grid gap-5 sm:grid-cols-3">
                <Field label="Points on correct">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={correctPoints}
                    onChange={(e) => setCorrectPoints(Number(e.target.value))}
                    className={inputCls}
                  />
                </Field>
                <Field label="Wrong / timeout penalty" hint="Points lost (0 = none)">
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={wrongPenalty}
                    onChange={(e) => setWrongPenalty(Number(e.target.value))}
                    className={inputCls}
                  />
                </Field>
                <Field label="Speed bonus">
                  <label className="flex h-[42px] cursor-pointer items-center gap-3 border border-white/15 bg-black/40 px-3">
                    <input
                      type="checkbox"
                      checked={speedBonus}
                      onChange={(e) => setSpeedBonus(e.target.checked)}
                    />
                    <span className="text-sm text-white/80">
                      Faster correct answers score more
                    </span>
                  </label>
                </Field>
              </div>
            ) : null}

            {step === 6 ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Choice
                    selected={winCondition === 'highest_score'}
                    title="Highest score"
                    note="When the event ends, top scores take the pot share."
                    onClick={() => {
                      setWinCondition('highest_score');
                      setWinnersCount((w) => Math.max(2, w));
                    }}
                  />
                  <Choice
                    selected={winCondition === 'last_standing'}
                    title="Last standing"
                    note="Misses and timeouts can eliminate. Last player(s) win."
                    onClick={() => {
                      setWinCondition('last_standing');
                      setWinnersCount(1);
                    }}
                  />
                </div>
                {winCondition === 'highest_score' ? (
                  <Field label="Number of winners" hint="How the pot is split at the top">
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={winnersCount}
                      onChange={(e) => setWinnersCount(Number(e.target.value))}
                      className={inputCls}
                    />
                  </Field>
                ) : null}
              </>
            ) : null}

            {step === 7 ? (
              <div className="space-y-6">
                <div className="border border-[#99ee2d]/30 bg-[#99ee2d]/5 p-5">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#99ee2d]">
                    Preview
                  </p>
                  <h3 className="mt-2 font-poster text-4xl uppercase text-white">
                    {name || 'Untitled event'}
                  </h3>
                  <p className="mt-3 max-w-xl text-sm text-white/60">
                    {description || 'No description yet.'}
                  </p>
                </div>

                <dl className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['Community', ownedCommunities.find((c) => c.id === communityId)?.name ?? 'Standalone'],
                    ['Category', category],
                    ['Entry', `${entryFee} CKB`],
                    ['Players', `${minPlayers}–${maxPlayers}`],
                    ['Starting pot', `${startingPot} CKB`],
                    [
                      'Move contribution',
                      contributionPerMove > 0 ? `+${contributionPerMove} CKB` : 'None',
                    ],
                    [
                      'Clock',
                      clockBehavior === 'shrink'
                        ? `Shrink · ${turnSecs}s → ${minTurnSecs}s`
                        : `Reset · ${resetSecs}s`,
                    ],
                    [
                      'Challenge',
                      `${questionSource === 'ai' ? 'AI' : 'Manual'} · ${questions.length} locked`,
                    ],
                    [
                      'Scoring',
                      `+${correctPoints} correct${wrongPenalty ? ` · −${wrongPenalty} miss` : ''}${
                        speedBonus ? ' · speed bonus' : ''
                      }`,
                    ],
                    [
                      'Winner',
                      winCondition === 'last_standing'
                        ? 'Last standing'
                        : `Highest score · top ${winnersCount}`,
                    ],
                    ['Sponsors', allowSponsorship ? 'Allowed' : 'Off'],
                  ].map(([k, v]) => (
                    <div key={k} className="border border-white/10 bg-black/30 px-3 py-3">
                      <dt className="font-mono text-[9px] uppercase text-white/40">{k}</dt>
                      <dd className="mt-1 text-sm font-medium text-white">{v}</dd>
                    </div>
                  ))}
                </dl>

                {!poolOk ? (
                  <p className="text-sm text-[#ff56f6]">
                    Finish the Challenge step — lock at least one valid question.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 0}
              className="border border-white/15 px-4 py-2.5 text-[11px] font-bold uppercase text-white/70 disabled:opacity-30"
            >
              Back
            </button>
            <div className="flex flex-wrap items-center gap-3">
              {create.error ? (
                <p className="text-sm text-[#99ee2d]">{create.error.message}</p>
              ) : null}
              {step < STEPS.length - 1 ? (
                <button
                  type="submit"
                  disabled={
                    (step === 0 && !basicsOk) || (step === 4 && !poolOk)
                  }
                  className="arena-cta px-6 py-3 text-xs font-bold uppercase disabled:opacity-40"
                >
                  Continue
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={create.isPending || !basicsOk || !poolOk}
                  className="arena-cta px-6 py-3 text-xs font-bold uppercase disabled:opacity-40"
                >
                  {create.isPending ? (
                    <>
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                      {eventCellsLive() ? 'Minting on-chain…' : 'Publishing…'}
                    </>
                  ) : eventCellsLive() ? (
                    'Publish on-chain'
                  ) : (
                    'Publish event'
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <ArenaStage backHref="/events" backLabel="Events">
      {children}
    </ArenaStage>
  );
}
