import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

type SeedQuiz = {
  id: string;
  content: {
    text: string;
    code: string;
    has_code: boolean;
  };
  options: {
    is_code: boolean;
    data: Record<string, string>;
  };
  answer: string;
  explanation: string;
  topicSlug: string;
  topicName: string;
};

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
}) as any;

const quizzes: SeedQuiz[] = [
  {
    id: 'c_case_01',
    content: {
      text: 'Kết quả xuất ra của đoạn code sau là gì?',
      code: '#include <stdio.h>\nvoid main() {\n    int a = 10, b = 20;\n    printf("%d", a > b ? a : b);\n}',
      has_code: true,
    },
    options: {
      is_code: false,
      data: {
        '1': '10',
        '2': '20',
        '3': '30',
        '4': 'Lỗi cú pháp',
      },
    },
    answer: '2',
    explanation:
      'Đây là toán tử tam nguyên. Vì 10 > 20 là sai nên biểu thức trả về giá trị của b là 20.',
    topicSlug: 'c-basic-flow-test',
    topicName: 'C Basic Flow Test',
  },
  {
    id: 'c_case_02',
    content: {
      text: 'Đâu là cách khai báo một con trỏ đúng trong ngôn ngữ C?',
      code: '',
      has_code: false,
    },
    options: {
      is_code: true,
      data: {
        '1': 'int p*;',
        '2': 'int &p;',
        '3': 'int *p;',
        '4': 'pointer int p;',
      },
    },
    answer: '3',
    explanation: 'Trong C, cú pháp khai báo con trỏ là: kieu_du_lieu *ten_bien.',
    topicSlug: 'c-basic-flow-test',
    topicName: 'C Basic Flow Test',
  },
  {
    id: 'c_case_03',
    content: {
      text: 'Đoạn mã nào dùng để cấp phát động mảng int 5 phần tử?',
      code: '',
      has_code: false,
    },
    options: {
      is_code: true,
      data: {
        '1': 'int *arr = malloc(5);',
        '2': 'int *arr = (int*)malloc(5 * sizeof(int));',
        '3': 'int arr = malloc(5 * sizeof(int));',
        '4': 'int *arr = alloc(5 * sizeof(int));',
      },
    },
    answer: '2',
    explanation: 'Can tinh so byte can cap phat: so_phan_tu * sizeof(int).',
    topicSlug: 'c-basic-flow-test',
    topicName: 'C Basic Flow Test',
  },
  {
    id: 'c_case_04',
    content: {
      text: 'Kết quả của biểu thức ++i khi i = 5 là gì?',
      code: '',
      has_code: false,
    },
    options: {
      is_code: false,
      data: {
        '1': '5',
        '2': '6',
        '3': 'Biên dịch lỗi',
        '4': 'Không xác định',
      },
    },
    answer: '2',
    explanation: 'Toan tu tien tang tang i truoc, sau do tra ve gia tri moi.',
    topicSlug: 'c-basic-flow-test',
    topicName: 'C Basic Flow Test',
  },
  {
    id: 'c_case_05',
    content: {
      text: 'Hàm nào dùng để giải phóng bộ nhớ đã cấp phát bởi malloc?',
      code: '',
      has_code: false,
    },
    options: {
      is_code: true,
      data: {
        '1': 'delete(ptr);',
        '2': 'free(ptr);',
        '3': 'dispose(ptr);',
        '4': 'remove(ptr);',
      },
    },
    answer: '2',
    explanation: 'Trong C, bo nho cap phat bang malloc/calloc/realloc duoc giai phong bang free.',
    topicSlug: 'c-basic-flow-test',
    topicName: 'C Basic Flow Test',
  },
  {
    id: 'c_case_06',
    content: {
      text: 'Kết quả của sizeof(char) trong C thông thường là bao nhiêu?',
      code: '',
      has_code: false,
    },
    options: {
      is_code: false,
      data: {
        '1': '0',
        '2': '1',
        '3': '2',
        '4': 'Phụ thuộc trình biên dịch nên không xác định',
      },
    },
    answer: '2',
    explanation: 'Theo chuan C, sizeof(char) luon bang 1 byte.',
    topicSlug: 'c-basic-flow-test',
    topicName: 'C Basic Flow Test',
  },
];

async function upsertTopic(slug: string, name: string) {
  const existing = await prisma.topic.findFirst({ where: { slug } });
  if (existing) {
    return prisma.topic.update({
      where: { id: existing.id },
      data: { name },
    });
  }
  return prisma.topic.create({ data: { slug, name } });
}

async function main() {
  console.log('Start seeding quizzes...');

  const topicPairs = new Map(quizzes.map((quiz) => [quiz.topicSlug, quiz.topicName]));

  for (const [slug, name] of topicPairs) {
    const topic = await upsertTopic(slug, name);
    console.log(`Topic ready: ${name} | slug=${slug} | id=${topic.id}`);
  }

  for (const item of quizzes) {
    const topic = await upsertTopic(item.topicSlug, item.topicName);
    const optionCreates = Object.entries(item.options.data).map(([label, content]) => ({
      label,
      content,
      isCode: item.options.is_code,
    }));

    await prisma.quiz.upsert({
      where: {
        topicId_quizCode: {
          topicId: topic.id,
          quizCode: item.id,
        },
      },
      create: {
        quizCode: item.id,
        question: item.content.text,
        code: item.content.has_code ? item.content.code : null,
        explanation: item.explanation,
        answer: item.answer,
        topicId: topic.id,
        options: {
          create: optionCreates as any,
        },
      } as any,
      update: {
        question: item.content.text,
        code: item.content.has_code ? item.content.code : null,
        explanation: item.explanation,
        answer: item.answer,
        options: {
          deleteMany: {},
          create: optionCreates as any,
        },
      } as any,
    } as any);

    console.log(`Upserted quiz: ${item.id}`);
  }

  console.log(`Seeding finished. Total quizzes: ${quizzes.length}`);
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
