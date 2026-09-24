'use client';

import { ArrowLeft, ArrowRight, Check, X } from '@phosphor-icons/react';
import Image from 'next/image';
import { useState, type ReactNode } from 'react';

export type ReviewItem = {
  quizId: string;
  content: { text: string; code?: string | null; image?: string | null };
  options?: { data?: Record<string, string> };
  selectedAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean | null;
  explanation?: string;
};

function optionEntries(item: ReviewItem): Array<[string, string]> {
  return Object.entries(item.options?.data || {});
}

export function QuizReview({
  items,
  actions,
}: {
  items: ReviewItem[];
  actions?: ReactNode;
}) {
  const [current, setCurrent] = useState(0);
  const item = items[current];
  if (!item) return null;

  const correct = item.isCorrect === true;
  const blank = !item.selectedAnswer;
  const options = optionEntries(item);
  const correctCount = items.filter((entry) => entry.isCorrect).length;
  const wrongCount = items.length - correctCount;

  return (
    <div className="quiz-layout">
      <section className="panel quiz-question">
        <p className={`review-badge ${correct ? 'ok' : 'bad'}`}>
          {correct ? <Check size={14} weight="bold" /> : <X size={14} weight="bold" />}
          {correct ? 'Đúng' : blank ? 'Bỏ trống' : 'Sai'}
        </p>
        <h1>{item.content.text}</h1>
        {item.content.code ? <pre className="code-block"><code>{item.content.code}</code></pre> : null}
        {item.content.image ? (
          <Image
            src={item.content.image}
            alt="Minh họa cho câu hỏi"
            width={960}
            height={540}
            style={{ width: '100%', height: 'auto', borderRadius: 12 }}
          />
        ) : null}
        <div className="answer-list">
          {options.length ? options.map(([label, text]) => {
            const isCorrectOption = label === item.correctAnswer;
            const isSelected = label === item.selectedAnswer;
            const state = isCorrectOption ? 'correct' : isSelected ? 'wrong' : 'neutral';
            return (
              <div key={label} className={`answer review ${state}`}>
                <span>{label}</span>
                <span>{text}</span>
              </div>
            );
          }) : (
            <p className="review-fallback">
              Đáp án của bạn: {item.selectedAnswer || 'Chưa trả lời'} · Đáp án đúng: {item.correctAnswer}
            </p>
          )}
        </div>
        <div className="review-explain">
          <strong>Giải thích</strong>
          <p>{item.explanation?.trim() || 'Câu này chưa có giải thích.'}</p>
        </div>
        <div className="list-actions" style={{ justifyContent: 'space-between', marginTop: 24 }}>
          <button type="button" className="button secondary" disabled={current === 0} onClick={() => setCurrent((value) => value - 1)}>
            <ArrowLeft /> Câu trước
          </button>
          <button
            type="button"
            className="button"
            disabled={current >= items.length - 1}
            onClick={() => setCurrent((value) => value + 1)}
          >
            Câu tiếp <ArrowRight />
          </button>
        </div>
      </section>
      <aside className="panel quiz-nav">
        <h3>Danh sách câu</h3>
        <p className="review-score">{correctCount} đúng · {wrongCount} sai</p>
        <p className="review-legend"><span className="dot ok" /> Đúng <span className="dot bad" /> Sai</p>
        <div className="question-map">
          {items.map((entry, index) => (
            <button
              key={entry.quizId}
              type="button"
              className={`${index === current ? 'current' : ''} ${entry.isCorrect ? 'correct' : 'wrong'}`}
              onClick={() => setCurrent(index)}
              aria-label={`Câu ${index + 1}, ${entry.isCorrect ? 'đúng' : 'sai'}`}
              aria-current={index === current ? 'true' : undefined}
            >
              {index + 1}
            </button>
          ))}
        </div>
        {actions ? <div className="review-actions">{actions}</div> : null}
      </aside>
    </div>
  );
}
