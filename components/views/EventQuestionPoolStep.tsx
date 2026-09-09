'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Pencil,
} from 'lucide-react';
import { generateQuestionsApi } from '@/lib/api/events';
import type {
  EventMode,
  HostQuestionDraft,
  QuestionDifficulty,
  QuestionSource,
  QuestionType,
} from '@/types/event';

function newBlankDraft(questionType: QuestionType): HostQuestionDraft {
  return {
    id: `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    prompt: '',
    options:
      questionType === 'true_false'
        ? ['True', 'False']
        : ['', '', '', ''],
    correctIndex: 0,
    difficulty: 'medium',
    explanation: '',
  };
}

type Props = {
  mode: EventMode;
  turnSecs: number;
  source: QuestionSource;
  onSourceChange: (s: QuestionSource) => void;
  questions: HostQuestionDraft[];
  onQuestionsChange: (q: HostQuestionDraft[]) => void;
  topic: string;
  onTopicChange: (t: string) => void;
  count: number;
  onCountChange: (n: number) => void;
  difficulty: QuestionDifficulty;
  onDifficultyChange: (d: QuestionDifficulty) => void;
  questionType: QuestionType;
  onQuestionTypeChange: (t: QuestionType) => void;
  instructions: string;
  onInstructionsChange: (s: string) => void;
};

export function EventQuestionPoolStep(props: Props) {
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  async function runGenerate() {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await generateQuestionsApi({
        topics: props.topic
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        difficulty: props.difficulty,
        count: props.count,
        mode: props.mode,
        turnSecs: props.turnSecs,
        instructions: props.instructions,
        questionType: props.questionType,
      });
      props.onQuestionsChange(res.questions);
      setEditId(res.questions[0]?.id ?? null);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setGenerating(false);
    }
  }

  function updateDraft(id: string, patch: Partial<HostQuestionDraft>) {
    props.onQuestionsChange(
      props.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    );
  }

  function move(id: string, dir: -1 | 1) {
    const idx = props.questions.findIndex((q) => q.id === id);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= props.questions.length) return;
    const copy = [...props.questions];
    const [row] = copy.splice(idx, 1);
    copy.splice(next, 0, row!);
    props.onQuestionsChange(copy);
  }

  function remove(id: string) {
    props.onQuestionsChange(props.questions.filter((q) => q.id !== id));
    if (editId === id) setEditId(null);
    if (previewId === id) setPreviewId(null);
  }

  const preview = props.questions.find((q) => q.id === previewId) ?? null;
  const editing = props.questions.find((q) => q.id === editId) ?? null;

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="text-[10px] font-bold uppercase tracking-wider text-white/45">
          Question source
        </legend>
        <p className="mt-1 text-xs text-white/45">
          AI is optional. Write your own set, or generate a draft you review before publish —
          not a separate game.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(
            [
              {
                id: 'ai' as const,
                label: 'AI Generated',
                note: 'Topic + knobs → draft pool → you edit.',
              },
              {
                id: 'manual' as const,
                label: 'Manual',
                note: 'You write every question yourself.',
              },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                props.onSourceChange(opt.id);
                if (opt.id === 'manual' && props.questions.length === 0) {
                  props.onQuestionsChange([newBlankDraft(props.questionType)]);
                }
              }}
              className={`border p-3 text-left transition ${
                props.source === opt.id
                  ? 'border-[#99ee2d] bg-[#99ee2d]/15 text-white'
                  : 'border-white/10 bg-black/30 text-white/80 hover:border-white/25'
              }`}
            >
              <span className="block text-sm font-bold uppercase">{opt.label}</span>
              <span className="mt-1 block text-[11px] text-white/50">{opt.note}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {props.source === 'ai' ? (
        <div className="space-y-4 border border-white/10 bg-black/30 p-4">
          <label className="block">
            <span className="text-[10px] font-bold uppercase text-white/45">Topic</span>
            <input
              value={props.topic}
              onChange={(e) => props.onTopicChange(e.target.value)}
              placeholder="e.g. CKB, Nervos, anime"
              className="mt-2 w-full border border-white/15 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-[#99ee2d]"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-[10px] font-bold uppercase text-white/45">
                Number of questions
              </span>
              <input
                type="number"
                min={1}
                max={40}
                value={props.count}
                onChange={(e) => props.onCountChange(Number(e.target.value) || 1)}
                className="mt-2 w-full border border-white/15 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-[#99ee2d]"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold uppercase text-white/45">Difficulty</span>
              <select
                value={props.difficulty}
                onChange={(e) =>
                  props.onDifficultyChange(e.target.value as QuestionDifficulty)
                }
                className="mt-2 w-full border border-white/15 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-[#99ee2d]"
              >
                <option value="easy" className="bg-[#111]">
                  Easy
                </option>
                <option value="medium" className="bg-[#111]">
                  Medium
                </option>
                <option value="hard" className="bg-[#111]">
                  Hard
                </option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-bold uppercase text-white/45">
                Question type
              </span>
              <select
                value={props.questionType}
                onChange={(e) =>
                  props.onQuestionTypeChange(e.target.value as QuestionType)
                }
                className="mt-2 w-full border border-white/15 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-[#99ee2d]"
              >
                <option value="multiple_choice" className="bg-[#111]">
                  Multiple choice
                </option>
                <option value="true_false" className="bg-[#111]">
                  True / False
                </option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-[10px] font-bold uppercase text-white/45">
              Any instructions
            </span>
            <textarea
              rows={2}
              value={props.instructions}
              onChange={(e) => props.onInstructionsChange(e.target.value)}
              placeholder="Optional — tone, avoid spoilers, focus on lore…"
              className="mt-2 w-full resize-none border border-white/15 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-[#99ee2d]"
            />
          </label>
          <button
            type="button"
            onClick={() => void runGenerate()}
            disabled={generating || !props.topic.trim()}
            className="inline-flex items-center gap-2 border border-[#99ee2d] bg-[#99ee2d] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[#111] disabled:opacity-40"
          >
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Generate set
          </button>
          {genError ? <p className="text-sm text-red-300">{genError}</p> : null}
          {props.questions.length > 0 ? (
            <p className="text-xs text-white/50">
              Review and edit below before you publish.
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-white/45">
            Question pool ({props.questions.length})
          </h3>
          <button
            type="button"
            onClick={() => {
              const draft = newBlankDraft(props.questionType);
              props.onQuestionsChange([...props.questions, draft]);
              setEditId(draft.id);
            }}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#99ee2d] hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Add question
          </button>
        </div>

        {props.questions.length === 0 ? (
          <p className="mt-3 border border-dashed border-white/15 px-3 py-6 text-center text-sm text-white/40">
            {props.source === 'ai'
              ? 'Generate a set, then edit here.'
              : 'Add your first question.'}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {props.questions.map((q, index) => (
              <li
                key={q.id}
                className="border border-white/10 bg-black/35 px-3 py-2.5"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 font-mono text-[10px] text-white/35">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">
                      {q.prompt.trim() || 'Untitled question'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-white/40">
                      {q.difficulty} · {q.options.filter((o) => o.trim()).length} options
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <IconBtn label="Up" onClick={() => move(q.id, -1)}>
                      <ChevronUp className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn label="Down" onClick={() => move(q.id, 1)}>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn label="Preview" onClick={() => setPreviewId(q.id)}>
                      <Eye className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn
                      label="Edit"
                      onClick={() => setEditId(editId === q.id ? null : q.id)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn label="Delete" onClick={() => remove(q.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconBtn>
                  </div>
                </div>

                {editing?.id === q.id ? (
                  <DraftEditor
                    draft={editing}
                    questionType={props.questionType}
                    onChange={(patch) => updateDraft(q.id, patch)}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {preview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal
          onClick={() => setPreviewId(null)}
        >
          <div
            className="w-full max-w-md border border-white/15 bg-[#111] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#99ee2d]">
              Preview · {preview.difficulty}
            </p>
            <p className="mt-3 text-base text-white">{preview.prompt || '—'}</p>
            <ul className="mt-4 space-y-2">
              {preview.options.map((opt, i) => (
                <li
                  key={i}
                  className={`border px-3 py-2 text-sm ${
                    i === preview.correctIndex
                      ? 'border-[#99ee2d]/60 bg-[#99ee2d]/10 text-white'
                      : 'border-white/10 text-white/70'
                  }`}
                >
                  {opt || `Option ${i + 1}`}
                  {i === preview.correctIndex ? (
                    <span className="ml-2 text-[10px] font-bold uppercase text-[#99ee2d]">
                      Correct
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            {preview.explanation ? (
              <p className="mt-3 text-xs text-white/45">{preview.explanation}</p>
            ) : null}
            <button
              type="button"
              onClick={() => setPreviewId(null)}
              className="mt-5 w-full border border-white/20 py-2 text-xs font-bold uppercase tracking-wider text-white/80"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="border border-white/10 p-1.5 text-white/55 hover:border-white/30 hover:text-white"
    >
      {children}
    </button>
  );
}

function DraftEditor({
  draft,
  questionType,
  onChange,
}: {
  draft: HostQuestionDraft;
  questionType: QuestionType;
  onChange: (patch: Partial<HostQuestionDraft>) => void;
}) {
  const optionCount = questionType === 'true_false' ? 2 : Math.max(2, draft.options.length);

  return (
    <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
      <label className="block">
        <span className="text-[10px] font-bold uppercase text-white/45">Question</span>
        <textarea
          rows={2}
          value={draft.prompt}
          onChange={(e) => onChange({ prompt: e.target.value })}
          className="mt-1.5 w-full resize-none border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-[#99ee2d]"
        />
      </label>
      <div className="space-y-2">
        <span className="text-[10px] font-bold uppercase text-white/45">
          Answer options
        </span>
        {Array.from({ length: optionCount }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name={`correct-${draft.id}`}
              checked={draft.correctIndex === i}
              onChange={() => onChange({ correctIndex: i })}
              title="Mark correct"
              className="accent-[#99ee2d]"
            />
            <input
              value={draft.options[i] ?? ''}
              onChange={(e) => {
                const options = [...draft.options];
                while (options.length < optionCount) options.push('');
                options[i] = e.target.value;
                onChange({ options });
              }}
              disabled={questionType === 'true_false'}
              placeholder={`Option ${i + 1}`}
              className="flex-1 border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-[#99ee2d] disabled:opacity-60"
            />
          </div>
        ))}
        <p className="text-[10px] text-white/35">Select the radio for the correct answer.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[10px] font-bold uppercase text-white/45">Difficulty</span>
          <select
            value={draft.difficulty}
            onChange={(e) =>
              onChange({ difficulty: e.target.value as QuestionDifficulty })
            }
            className="mt-1.5 w-full border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-[#99ee2d]"
          >
            <option value="easy" className="bg-[#111]">
              Easy
            </option>
            <option value="medium" className="bg-[#111]">
              Medium
            </option>
            <option value="hard" className="bg-[#111]">
              Hard
            </option>
          </select>
        </label>
        <label className="block sm:col-span-1">
          <span className="text-[10px] font-bold uppercase text-white/45">
            Optional explanation
          </span>
          <input
            value={draft.explanation ?? ''}
            onChange={(e) => onChange({ explanation: e.target.value })}
            className="mt-1.5 w-full border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-[#99ee2d]"
          />
        </label>
      </div>
    </div>
  );
}
