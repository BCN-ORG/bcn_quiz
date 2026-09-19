import ExcelJS from 'exceljs';

export type ImportedQuizRow = {
  topicId?: string;
  quizCode?: string;
  question: string;
  code?: string;
  answer: string;
  explanation?: string;
  options: Array<{ label: string; content: string; isCode: boolean }>;
};

const HEADER_ALIASES: Record<string, string> = {
  question: 'question',
  'câu hỏi': 'question',
  cauhoi: 'question',
  text: 'question',
  content__text: 'question',
  content_text: 'question',
  a: 'A',
  optiona: 'A',
  'đáp án a': 'A',
  'dap an a': 'A',
  options__1: 'A',
  options_1: 'A',
  option1: 'A',
  b: 'B',
  optionb: 'B',
  'đáp án b': 'B',
  'dap an b': 'B',
  options__2: 'B',
  options_2: 'B',
  option2: 'B',
  c: 'C',
  optionc: 'C',
  'đáp án c': 'C',
  'dap an c': 'C',
  options__3: 'C',
  options_3: 'C',
  option3: 'C',
  d: 'D',
  optiond: 'D',
  'đáp án d': 'D',
  'dap an d': 'D',
  options__4: 'D',
  options_4: 'D',
  option4: 'D',
  answer: 'answer',
  correct: 'answer',
  'đáp án đúng': 'answer',
  'dap an dung': 'answer',
  explanation: 'explanation',
  'giải thích': 'explanation',
  'giai thich': 'explanation',
  code: 'code',
  content__code: 'code',
  content_code: 'code',
  quizcode: 'quizCode',
  'mã': 'quizCode',
  ma: 'quizCode',
  topicid: 'topicId',
  topic: 'topicId',
  options__iscode: 'optionsIsCode',
  options_iscode: 'optionsIsCode',
};

function normHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function cell(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function normalizeAnswer(raw: string): string {
  const value = raw.trim().toUpperCase();
  if (['A', 'B', 'C', 'D'].includes(value)) return value;
  if (value === '1') return 'A';
  if (value === '2') return 'B';
  if (value === '3') return 'C';
  if (value === '4') return 'D';
  return value;
}

function sheetToObjects(sheet: ExcelJS.Worksheet): Record<string, unknown>[] {
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cellValue, col) => {
    headers[col - 1] = cell(cellValue.value);
  });
  if (!headers.some(Boolean)) return [];

  const rows: Record<string, unknown>[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, unknown> = {};
    let empty = true;
    headers.forEach((header, index) => {
      if (!header) return;
      const value = cell(row.getCell(index + 1).value);
      obj[header] = value;
      if (value) empty = false;
    });
    if (!empty) rows.push(obj);
  });
  return rows;
}

function parseCsv(text: string): Record<string, unknown>[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const obj: Record<string, unknown> = {};
    headers.forEach((header, i) => {
      obj[header] = cols[i] ?? '';
    });
    return obj;
  });
}

function rowsToQuizzes(rows: Record<string, unknown>[]): ImportedQuizRow[] {
  if (!rows.length) throw new Error('Sheet trống — cần dòng tiêu đề và ít nhất 1 câu hỏi.');

  const sample = rows[0];
  const keyMap = new Map<string, string>();
  for (const rawKey of Object.keys(sample)) {
    const mapped = HEADER_ALIASES[normHeader(rawKey)];
    if (mapped) keyMap.set(rawKey, mapped);
  }

  const required = ['question', 'A', 'B', 'C', 'D', 'answer'];
  const present = new Set(keyMap.values());
  const missing = required.filter((key) => !present.has(key));
  if (missing.length) {
    throw new Error(
      `Thiếu cột: ${missing.join(', ')}. Hỗ trợ: question/A/B/C/D/answer hoặc content__text/options__1..4/answer.`,
    );
  }

  const quizzes: ImportedQuizRow[] = [];
  rows.forEach((row, index) => {
    const get = (field: string) => {
      for (const [rawKey, mapped] of keyMap) {
        if (mapped === field) return cell(row[rawKey]);
      }
      return '';
    };
    const question = get('question');
    const A = get('A');
    const B = get('B');
    const C = get('C');
    const D = get('D');
    const answer = normalizeAnswer(get('answer'));
    if (!question && !A && !B && !C && !D && !answer) return;
    if (!question) throw new Error(`Dòng ${index + 2}: thiếu question.`);
    if (!A || !B || !C || !D) throw new Error(`Dòng ${index + 2}: cần đủ đáp án A–D (hoặc options__1..4).`);
    if (!['A', 'B', 'C', 'D'].includes(answer)) {
      throw new Error(`Dòng ${index + 2}: answer phải là A–D hoặc 1–4 (nhận "${answer || 'trống'}").`);
    }
    const optionsIsCode = /^(true|1|yes)$/i.test(get('optionsIsCode'));
    const item: ImportedQuizRow = {
      question,
      answer,
      options: [
        { label: 'A', content: A, isCode: optionsIsCode },
        { label: 'B', content: B, isCode: optionsIsCode },
        { label: 'C', content: C, isCode: optionsIsCode },
        { label: 'D', content: D, isCode: optionsIsCode },
      ],
    };
    const explanation = get('explanation');
    const code = get('code');
    const quizCode = get('quizCode');
    const topicId = get('topicId');
    if (explanation) item.explanation = explanation;
    if (code) item.code = code;
    if (quizCode) item.quizCode = quizCode;
    if (topicId) item.topicId = topicId;
    quizzes.push(item);
  });

  if (!quizzes.length) throw new Error('Không có câu hỏi hợp lệ trong file.');
  if (quizzes.length > 200) throw new Error('Tối đa 200 câu mỗi lần import.');
  return quizzes;
}

/** Build quiz payloads from first sheet of .xlsx / .csv */
export async function parseQuizSpreadsheet(input: ArrayBuffer | Uint8Array): Promise<ImportedQuizRow[]> {
  const buffer = input instanceof Uint8Array ? input : new Uint8Array(input);
  const head = new TextDecoder().decode(buffer.slice(0, 8));
  const looksCsv = !head.includes('PK') && (head.includes(',') || head.includes('question') || head.includes('content'));

  if (looksCsv) {
    return rowsToQuizzes(parseCsv(new TextDecoder().decode(buffer)));
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new Error('Không đọc được file. Dùng .xlsx hoặc .csv (không hỗ trợ .xls cũ).');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('File Excel không có sheet nào.');
  return rowsToQuizzes(sheetToObjects(sheet));
}

/** Download a starter .xlsx mentors can fill in Excel. */
export async function downloadQuizImportTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('quizzes');
  sheet.addRows([
    ['question', 'A', 'B', 'C', 'D', 'answer', 'explanation', 'code'],
    ['NestJS Guard chạy khi nào?', 'Trước middleware', 'Sau pipe', 'Trong controller', 'Sau interceptor', 'A', 'Guards chạy sau middleware.', ''],
    ['Decorator nào đánh dấu module?', '@Module()', '@Injectable()', '@Controller()', '@Inject()', 'A', '', ''],
  ]);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'quiz-import-template.xlsx';
  anchor.click();
  URL.revokeObjectURL(url);
}
