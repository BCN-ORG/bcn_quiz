/**
 * DEV ONLY. Synthetic Quiz content for testing against the Profiles dev stack (bcn_profiles/docker-compose.dev-stack.yml):
 * courses, topics, questions, a project requirement and leaderboard results for the seeded dev accounts.
 * Safe to re-run: everything is keyed by slug / quizCode / a fixed session id, and nothing outside the "dev-" data is touched.
 * It refuses to run unless DATABASE_URL points at localhost, and needs SEED_DEV=1 (the npm script sets it).
 *
 *   npm run db:seed:dev
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { businessDate, calculateTopicLeaderboardScore } from '../src/leaderboard/leaderboard-rules';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');
if (process.env.SEED_DEV !== '1') throw new Error('Refusing to run: use `npm run db:seed:dev` (sets SEED_DEV=1).');
const host = new URL(databaseUrl).hostname;
if (!['localhost', '127.0.0.1'].includes(host)) {
  throw new Error(`Refusing to seed dev data into a non-local database (${host}).`);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) }) as any;

// Same ids as bcn_profiles/docker/dev-stack/dev-seed.sql
const USERS = ['dev-member-01', 'dev-member-02', 'dev-member-03', 'dev-member-04', 'dev-member-05', 'dev-mentor'];

type Q = { code: string; text: string; code_block?: string; options: string[]; answer: number; why: string };

const TOPICS: { slug: string; name: string; questions: Q[] }[] = [
  {
    slug: 'dev-js-basics',
    name: 'JavaScript co ban (dev)',
    questions: [
      { code: 'js01', text: 'typeof null tra ve gi?', options: ['"null"', '"object"', '"undefined"', '"number"'], answer: 1, why: 'Loi lich su cua JavaScript: typeof null la "object".' },
      { code: 'js02', text: 'Ket qua cua 0.1 + 0.2 === 0.3?', options: ['true', 'false', 'undefined', 'Loi'], answer: 1, why: 'So thuc dau phay dong nhi phan khong bieu dien chinh xac 0.1 va 0.2.' },
      { code: 'js03', text: 'Tu khoa nao khai bao bien khong the gan lai?', options: ['var', 'let', 'const', 'static'], answer: 2, why: 'const khong cho phep gan lai.' },
      { code: 'js04', text: 'Mang nao dung: [1, 2, 3].map(x => x * 2)?', options: ['[2, 4, 6]', '[1, 4, 9]', '[2, 3, 4]', '6'], answer: 0, why: 'map tra ve mang moi voi moi phan tu nhan doi.' },
      { code: 'js05', text: 'Ham nao them phan tu vao cuoi mang?', options: ['shift', 'unshift', 'push', 'pop'], answer: 2, why: 'push them vao cuoi mang.' },
      { code: 'js06', text: '"5" + 3 cho ket qua?', options: ['8', '"53"', 'NaN', 'Loi'], answer: 1, why: 'Toan tu + noi chuoi khi mot ben la chuoi.' },
      { code: 'js07', text: 'Promise nao duoc chay khi ca hai thanh cong?', options: ['Promise.race', 'Promise.any', 'Promise.all', 'Promise.finally'], answer: 2, why: 'Promise.all cho tat ca cung hoan thanh.' },
      { code: 'js08', text: 'Ket qua cua [] == false?', options: ['true', 'false', 'undefined', 'Loi'], answer: 0, why: 'Ep kieu: [] thanh "" roi thanh 0, false thanh 0.' },
    ],
  },
  {
    slug: 'dev-sql-basics',
    name: 'SQL co ban (dev)',
    questions: [
      { code: 'sq01', text: 'Lenh nao lay du lieu tu bang?', options: ['INSERT', 'SELECT', 'UPDATE', 'DELETE'], answer: 1, why: 'SELECT dung de doc du lieu.' },
      { code: 'sq02', text: 'Menh de nao loc cac dong?', options: ['GROUP BY', 'ORDER BY', 'WHERE', 'HAVING'], answer: 2, why: 'WHERE loc dong truoc khi gom nhom.' },
      { code: 'sq03', text: 'JOIN nao giu moi dong cua bang ben trai?', options: ['INNER JOIN', 'LEFT JOIN', 'CROSS JOIN', 'SELF JOIN'], answer: 1, why: 'LEFT JOIN giu tat ca dong ben trai.' },
      { code: 'sq04', text: 'COUNT(*) dem gi?', options: ['Chi dong khac NULL', 'Tat ca dong', 'Cot dau tien', 'Dong trung'], answer: 1, why: 'COUNT(*) dem moi dong, ke ca NULL.' },
      { code: 'sq05', text: 'Khoa nao dinh danh duy nhat mot dong?', options: ['Foreign key', 'Primary key', 'Index', 'View'], answer: 1, why: 'Primary key la khoa chinh.' },
      { code: 'sq06', text: 'Menh de nao sap xep ket qua?', options: ['SORT', 'ORDER BY', 'GROUP BY', 'ARRANGE'], answer: 1, why: 'ORDER BY sap xep ket qua.' },
    ],
  },
  {
    slug: 'dev-git-basics',
    name: 'Git co ban (dev)',
    questions: [
      { code: 'gt01', text: 'Lenh nao tao commit?', options: ['git add', 'git commit', 'git push', 'git fetch'], answer: 1, why: 'git commit ghi lai thay doi.' },
      { code: 'gt02', text: 'Lenh nao day commit len remote?', options: ['git pull', 'git clone', 'git push', 'git merge'], answer: 2, why: 'git push gui commit len remote.' },
      { code: 'gt03', text: 'Nhanh mac dinh thuong gap la gi?', options: ['main', 'root', 'trunk2', 'base'], answer: 0, why: 'main (truoc day la master).' },
      { code: 'gt04', text: 'Lenh nao xem lich su commit?', options: ['git log', 'git show-all', 'git history', 'git list'], answer: 0, why: 'git log hien thi lich su.' },
      { code: 'gt05', text: 'Lenh nao tao nhanh moi va chuyen sang do?', options: ['git branch -d x', 'git checkout -b x', 'git merge x', 'git stash x'], answer: 1, why: 'checkout -b tao va chuyen nhanh.' },
    ],
  },
];

const COURSES = [
  { slug: 'dev-web-fundamentals', name: 'Web co ban (dev)', description: 'Khoa hoc mau de test: 2 topic va do an.', topics: ['dev-js-basics', 'dev-git-basics'], hasProject: true },
  { slug: 'dev-data-fundamentals', name: 'Du lieu co ban (dev)', description: 'Khoa hoc mau khong co do an.', topics: ['dev-sql-basics'], hasProject: false },
];

const LABELS = ['A', 'B', 'C', 'D'];

async function ensureTopic(slug: string, name: string) {
  const existing = await prisma.topic.findFirst({ where: { slug } });
  return existing
    ? prisma.topic.update({ where: { id: existing.id }, data: { name } })
    : prisma.topic.create({ data: { slug, name } });
}

async function main() {
  console.log('Seeding dev content...');
  const topicIds: Record<string, string> = {};
  const quizIdsByTopic: Record<string, { id: string; answer: string }[]> = {};

  for (const t of TOPICS) {
    const topic = await ensureTopic(t.slug, t.name);
    topicIds[t.slug] = topic.id;
    quizIdsByTopic[t.slug] = [];
    for (const q of t.questions) {
      const options = q.options.map((content, i) => ({ label: LABELS[i], content, isCode: false }));
      const quiz = await prisma.quiz.upsert({
        where: { topicId_quizCode: { topicId: topic.id, quizCode: q.code } },
        create: { quizCode: q.code, question: q.text, explanation: q.why, answer: LABELS[q.answer], topicId: topic.id, options: { create: options } },
        update: { question: q.text, explanation: q.why, answer: LABELS[q.answer], options: { deleteMany: {}, create: options } },
      });
      quizIdsByTopic[t.slug].push({ id: quiz.id, answer: LABELS[q.answer] });
    }
    console.log(`  topic ${t.slug}: ${t.questions.length} questions`);
  }

  for (const c of COURSES) {
    const course = await prisma.course.upsert({
      where: { slug: c.slug },
      create: { slug: c.slug, name: c.name, description: c.description, hasProject: c.hasProject },
      update: { name: c.name, description: c.description, hasProject: c.hasProject },
    });
    for (const [i, slug] of c.topics.entries()) {
      await prisma.courseTopic.upsert({
        where: { courseId_topicId: { courseId: course.id, topicId: topicIds[slug] } },
        create: { courseId: course.id, topicId: topicIds[slug], sortOrder: i + 1 },
        update: { sortOrder: i + 1 },
      });
    }
    if (c.hasProject) {
      const dueAt = new Date(Date.now() + 14 * 24 * 3600 * 1000);
      await prisma.courseProjectRequirement.upsert({
        where: { courseId: course.id },
        create: { courseId: course.id, title: 'Do an: trang ca nhan', description: 'Nop file zip trang web ca nhan (du lieu mau).', isRequired: true, dueAt },
        update: { title: 'Do an: trang ca nhan', description: 'Nop file zip trang web ca nhan (du lieu mau).', isRequired: true },
      });
    }
    console.log(`  course ${c.slug}`);
  }

  // Leaderboard: the first submit of a topic is the user's one official result (isCounted = true); later submits are
  // practice and have no row. Users are spread over today and the last 2 days so each daily board has entries.
  // Accuracy and speed differ per user so the ranking has a clear order.
  const accuracy = [1, 0.875, 0.75, 0.75, 0.5, 0.25];
  const secondsPer = [95, 120, 140, 110, 200, 300];
  let results = 0;
  for (const slug of ['dev-js-basics', 'dev-git-basics']) {
    const quizzes = quizIdsByTopic[slug];
    for (const [u, userId] of USERS.entries()) {
      const day = u % 3;
      const business = businessDate(new Date(Date.now() - day * 24 * 3600 * 1000));
      const correct = Math.round(quizzes.length * accuracy[u]);
      const durationMs = secondsPer[u] * 1000;
      const submittedAt = new Date(Date.now() - day * 24 * 3600 * 1000 - (USERS.length - u) * 60 * 1000);
      const startedAt = new Date(submittedAt.getTime() - durationMs);
      const sessionId = `dev-session-${slug}-${userId}`;
      const answers: Record<string, string> = {};
      quizzes.forEach((q, i) => {
        answers[q.id] = i < correct ? q.answer : LABELS[(LABELS.indexOf(q.answer) + 1) % 4];
      });
      const existing = await prisma.topicLeaderboardResult.findFirst({
        where: { userId, topicId: topicIds[slug], isCounted: true },
      });
      if (existing) continue;
      await prisma.attemptSession.upsert({
        where: { id: sessionId },
        create: { id: sessionId, userId, topicId: topicIds[slug], status: 'SUBMITTED', answers, startedAt, lastSeenAt: submittedAt, expiresAt: new Date(submittedAt.getTime() + 3600_000), submittedAt },
        update: {},
      });
      await prisma.topicLeaderboardResult.create({
        data: { userId, topicId: topicIds[slug], sessionId, businessDate: business, isCounted: true, score: calculateTopicLeaderboardScore(correct, quizzes.length), correctCount: correct, totalQuestions: quizzes.length, durationMs, submittedAt },
      });
      results++;
    }
  }
  console.log(`  leaderboard results added: ${results}`);
  console.log('Done. Log in as member01@dev.bcn.local / Dev@123456 (admin: admin@dev.bcn.local).');
}

main()
  .catch((e) => {
    console.error('Dev seeding failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
