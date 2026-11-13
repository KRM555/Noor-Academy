import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import path from 'node:path';

const dbPath = path.resolve(process.cwd(), 'noor_bayan.db');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash) return false;
  if (storedHash.startsWith('scrypt:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 3) return false;
    const [, salt, hexHash] = parts;
    const derived = crypto.scryptSync(password, salt, 64);
    const storedBuf = Buffer.from(hexHash, 'hex');
    if (derived.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(derived, storedBuf);
  }
  // Legacy SHA-256 compatibility for pre-existing seeded accounts (upgraded to scrypt on login)
  const legacyHash = crypto.createHash('sha256').update(`noor_bayan_salt_${password}`).digest('hex');
  const a = Buffer.from(legacyHash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function needsPasswordRehash(storedHash: string): boolean {
  return !storedHash.startsWith('scrypt:');
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student', 'teacher', 'admin', 'guardian')),
      is_active INTEGER NOT NULL DEFAULT 1,
      preferred_lang TEXT NOT NULL DEFAULT 'ar',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      description_ar TEXT NOT NULL,
      description_en TEXT NOT NULL,
      age_range TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      criteria_ar TEXT NOT NULL,
      criteria_en TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS guardians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER REFERENCES profiles(id),
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      relation TEXT NOT NULL DEFAULT 'ولي أمر',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER UNIQUE REFERENCES profiles(id),
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      bio_ar TEXT NOT NULL,
      bio_en TEXT NOT NULL,
      qualifications_ar TEXT NOT NULL,
      qualifications_en TEXT NOT NULL,
      specialty_ar TEXT NOT NULL,
      specialty_en TEXT NOT NULL,
      avatar_url TEXT NOT NULL,
      hourly_rate REAL NOT NULL DEFAULT 150,
      is_public INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER UNIQUE REFERENCES profiles(id),
      guardian_id INTEGER REFERENCES guardians(id),
      student_code TEXT UNIQUE NOT NULL,
      full_name_ar TEXT NOT NULL,
      full_name_en TEXT NOT NULL,
      age INTEGER NOT NULL,
      level_id INTEGER REFERENCES levels(id),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'graduated')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title_ar TEXT NOT NULL,
      title_en TEXT NOT NULL,
      description_ar TEXT NOT NULL,
      description_en TEXT NOT NULL,
      level_id INTEGER REFERENCES levels(id),
      teacher_id INTEGER REFERENCES teachers(id),
      schedule_ar TEXT NOT NULL,
      schedule_en TEXT NOT NULL,
      price_monthly REAL NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 12,
      is_featured INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL REFERENCES courses(id),
      title_ar TEXT NOT NULL,
      title_en TEXT NOT NULL,
      lesson_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      duration_min INTEGER NOT NULL DEFAULT 45,
      objectives_ar TEXT NOT NULL,
      objectives_en TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS lesson_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id INTEGER NOT NULL REFERENCES lessons(id),
      title_ar TEXT NOT NULL,
      title_en TEXT NOT NULL,
      url TEXT NOT NULL,
      link_type TEXT NOT NULL CHECK(link_type IN ('zoom', 'meet', 'material', 'recording'))
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id),
      course_id INTEGER NOT NULL REFERENCES courses(id),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed')),
      enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      UNIQUE(student_id, course_id)
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id INTEGER NOT NULL REFERENCES lessons(id),
      student_id INTEGER NOT NULL REFERENCES students(id),
      status TEXT NOT NULL CHECK(status IN ('present', 'absent', 'excused', 'late')),
      notes TEXT DEFAULT '',
      recorded_by INTEGER REFERENCES profiles(id),
      recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(lesson_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL REFERENCES courses(id),
      title_ar TEXT NOT NULL,
      title_en TEXT NOT NULL,
      exam_date TEXT NOT NULL,
      max_score REAL NOT NULL DEFAULT 100,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS exam_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL REFERENCES exams(id),
      student_id INTEGER NOT NULL REFERENCES students(id),
      score REAL NOT NULL,
      feedback_ar TEXT DEFAULT '',
      feedback_en TEXT DEFAULT '',
      graded_by INTEGER REFERENCES profiles(id),
      graded_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(exam_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS recitations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id),
      course_id INTEGER NOT NULL REFERENCES courses(id),
      surah_name TEXT NOT NULL,
      ayah_from INTEGER NOT NULL,
      ayah_to INTEGER NOT NULL,
      tajweed_score REAL NOT NULL,
      memorization_score REAL NOT NULL,
      notes_ar TEXT DEFAULT '',
      recorded_by INTEGER REFERENCES profiles(id),
      recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id),
      course_id INTEGER NOT NULL REFERENCES courses(id),
      period TEXT NOT NULL,
      behavior_score REAL NOT NULL,
      participation_score REAL NOT NULL,
      summary_ar TEXT NOT NULL,
      summary_en TEXT NOT NULL,
      evaluated_by INTEGER REFERENCES profiles(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS placement_tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_name TEXT NOT NULL,
      age INTEGER NOT NULL,
      parent_email TEXT DEFAULT '',
      score INTEGER NOT NULL,
      recommended_level_id INTEGER REFERENCES levels(id),
      answers_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title_ar TEXT NOT NULL,
      title_en TEXT NOT NULL,
      body_ar TEXT NOT NULL,
      body_en TEXT NOT NULL,
      target_scope TEXT NOT NULL CHECK(target_scope IN ('all_students', 'course', 'specific_students')),
      target_course_id INTEGER REFERENCES courses(id),
      created_by INTEGER REFERENCES profiles(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS announcement_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      announcement_id INTEGER NOT NULL REFERENCES announcements(id),
      student_id INTEGER NOT NULL REFERENCES students(id),
      UNIQUE(announcement_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES profiles(id),
      title_ar TEXT NOT NULL,
      title_en TEXT NOT NULL,
      body_ar TEXT NOT NULL,
      body_en TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      verification_code TEXT UNIQUE NOT NULL,
      student_id INTEGER NOT NULL REFERENCES students(id),
      course_id INTEGER NOT NULL REFERENCES courses(id),
      title_ar TEXT NOT NULL,
      title_en TEXT NOT NULL,
      grade_label TEXT NOT NULL,
      issued_at TEXT NOT NULL DEFAULT (datetime('now')),
      issued_by INTEGER REFERENCES profiles(id),
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title_ar TEXT NOT NULL,
      title_en TEXT NOT NULL,
      description_ar TEXT NOT NULL,
      description_en TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('letters', 'numbers', 'memorization', '3d_explorer')),
      is_public_sample INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS game_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id),
      game_id INTEGER NOT NULL REFERENCES games(id),
      score INTEGER NOT NULL DEFAULT 0,
      stars INTEGER NOT NULL DEFAULT 0,
      completed_levels INTEGER NOT NULL DEFAULT 1,
      played_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(student_id, game_id)
    );

    CREATE TABLE IF NOT EXISTS teacher_payout_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER UNIQUE NOT NULL REFERENCES teachers(id),
      account_holder_name TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      iban TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payroll (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id),
      month_year TEXT NOT NULL,
      base_amount REAL NOT NULL,
      bonus_amount REAL NOT NULL DEFAULT 0,
      deduction_amount REAL NOT NULL DEFAULT 0,
      net_amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid')),
      paid_at TEXT,
      created_by INTEGER REFERENCES profiles(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(teacher_id, month_year)
    );

    CREATE TABLE IF NOT EXISTS admission_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_name TEXT NOT NULL,
      student_age INTEGER NOT NULL,
      guardian_name TEXT NOT NULL,
      guardian_email TEXT NOT NULL,
      guardian_phone TEXT NOT NULL,
      preferred_course_id INTEGER REFERENCES courses(id),
      recommended_level_id INTEGER REFERENCES levels(id),
      notes TEXT DEFAULT '',
      consent_accepted INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      reviewed_by INTEGER REFERENCES profiles(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS legal_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_type TEXT UNIQUE NOT NULL CHECK(doc_type IN ('terms', 'privacy', 'refund')),
      version TEXT NOT NULL DEFAULT '1.0',
      title_ar TEXT NOT NULL,
      title_en TEXT NOT NULL,
      content_ar TEXT NOT NULL,
      content_en TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS consents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      doc_version TEXT NOT NULL,
      accepted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS testimonials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guardian_name_ar TEXT NOT NULL,
      guardian_name_en TEXT NOT NULL,
      relation_ar TEXT NOT NULL,
      relation_en TEXT NOT NULL,
      quote_ar TEXT NOT NULL,
      quote_en TEXT NOT NULL,
      student_outcome_ar TEXT NOT NULL,
      student_outcome_en TEXT NOT NULL,
      is_approved INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER REFERENCES profiles(id),
      actor_name TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const countProfiles = (db.prepare('SELECT COUNT(*) as c FROM profiles').get() as { c: number }).c;
  if (countProfiles === 0) {
    seedInitialData();
  }
  ensureClientCourses();
  migrateAssetPaths();
}

function migrateAssetPaths() {
  db.prepare(`UPDATE teachers SET avatar_url = '/assets/images/teacher_portrait_1.webp' WHERE avatar_url LIKE '%teacher_portrait_1%'`).run();
  db.prepare(`UPDATE teachers SET avatar_url = '/assets/images/teacher_portrait_2.webp' WHERE avatar_url LIKE '%teacher_portrait_2%'`).run();
  db.prepare(`UPDATE teachers SET avatar_url = '/assets/images/teacher_portrait_3.webp' WHERE avatar_url LIKE '%teacher_portrait_3%'`).run();
}

function ensureClientCourses() {
  const existingTitles = new Set(
    (db.prepare('SELECT title_ar FROM courses WHERE deleted_at IS NULL').all() as Array<{ title_ar: string }>).map(
      (r) => r.title_ar
    )
  );
  const firstLevel = db.prepare('SELECT id FROM levels ORDER BY order_index ASC LIMIT 1').get() as { id: number } | undefined;
  const secondLevel = db.prepare('SELECT id FROM levels ORDER BY order_index ASC LIMIT 1 OFFSET 1').get() as { id: number } | undefined;
  const teachers = db.prepare('SELECT id FROM teachers WHERE deleted_at IS NULL ORDER BY id ASC').all() as Array<{ id: number }>;

  const lvl1Id = firstLevel?.id || 1;
  const lvl2Id = secondLevel?.id || lvl1Id;
  const t1Id = teachers[0]?.id || 1;
  const t2Id = teachers[1]?.id || t1Id;
  const t3Id = teachers[2]?.id || t1Id;

  const clientPrograms = [
    {
      title_ar: 'تعليم اللغات (الإنجليزية والفرنسية والألمانية)',
      title_en: 'Languages Program (English, French & German)',
      description_ar: 'تأسيس وتطوير مهارات المحادثة والقراءة والكتابة في اللغة الإنجليزية والفرنسية والألمانية للأطفال والناشئة.',
      description_en: 'Interactive speaking, reading, and writing foundations in English, French, and German for young learners.',
      level_id: lvl2Id,
      teacher_id: t3Id,
      schedule_ar: 'الأحد والأربعاء · 6:00 مساءً',
      schedule_en: 'Sun & Wed · 6:00 PM AST',
      price_monthly: 380,
      capacity: 8,
    },
    {
      title_ar: 'المناهج الدولية (البريطانية والأمريكية)',
      title_en: 'International Curricula (British & American)',
      description_ar: 'شرح ومتابعة شاملة للمناهج البريطانية والأمريكية والدولية بأسلوب مبسط يبني الفهم العميق.',
      description_en: 'Comprehensive support for British, American, and International school curricula with clear concept mastery.',
      level_id: lvl2Id,
      teacher_id: t2Id,
      schedule_ar: 'السبت والثلاثاء · 5:30 مساءً',
      schedule_en: 'Sat & Tue · 5:30 PM AST',
      price_monthly: 450,
      capacity: 6,
    },
    {
      title_ar: 'جميع المواد الدراسية (رياضيات وعلوم وعربي وإنجليزي)',
      title_en: 'All School Subjects (Math, Science, Arabic & English)',
      description_ar: 'حصص تفاعلية متكاملة في الرياضيات والعلوم واللغة العربية والإنجليزية لمختلف المراحل الدراسية.',
      description_en: 'Integrated live tutoring across Math, Science, Arabic, and English tailored to each grade level.',
      level_id: lvl1Id,
      teacher_id: t3Id,
      schedule_ar: 'الإثنين والخميس · 4:30 مساءً',
      schedule_en: 'Mon & Thu · 4:30 PM AST',
      price_monthly: 400,
      capacity: 8,
    },
    {
      title_ar: 'الحساب الذهني وتنمية المهارات العقلية',
      title_en: 'Mental Math & Cognitive Skills',
      description_ar: 'تنمية التركيز والذاكرة وسرعة البديهة والقدرات العقلية باستخدام العداد الذهني (الأباكوس) والأنشطة التفاعلية.',
      description_en: 'Boosting focus, memory, and mental calculation speed using abacus techniques and interactive exercises.',
      level_id: lvl1Id,
      teacher_id: t2Id,
      schedule_ar: 'الجمعة · 4:30 مساءً',
      schedule_en: 'Friday · 4:30 PM AST',
      price_monthly: 320,
      capacity: 8,
    },
    {
      title_ar: 'تنمية النطق ومهارات التواصل',
      title_en: 'Speech & Communication Development',
      description_ar: 'برامج متخصصة لتنمية النطق السليم، الطلاقة اللغوية، وبناء الثقة في التعبير والتواصل للأطفال.',
      description_en: 'Specialized sessions for clear articulation, expressive language, and confident communication.',
      level_id: lvl1Id,
      teacher_id: t1Id,
      schedule_ar: 'السبت · 3:00 مساءً',
      schedule_en: 'Saturday · 3:00 PM AST',
      price_monthly: 340,
      capacity: 5,
    },
    {
      title_ar: 'الدعم والمتابعة التعليمية المستمرة',
      title_en: 'Academic Support & Continuous Follow-up',
      description_ar: 'خطط متابعة فردية لمستوى الطالب وتطوير أدائه الدراسي باستمرار مع تقارير دورية للأهل.',
      description_en: 'Personalized study plans and continuous academic coaching with regular guardian progress reports.',
      level_id: lvl2Id,
      teacher_id: t1Id,
      schedule_ar: 'مرن طوال الأسبوع',
      schedule_en: 'Flexible Weekly Slots',
      price_monthly: 360,
      capacity: 6,
    },
  ];

  const insertCourse = db.prepare(`
    INSERT INTO courses (title_ar, title_en, description_ar, description_en, level_id, teacher_id, schedule_ar, schedule_en, price_monthly, capacity, is_featured)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  for (const p of clientPrograms) {
    if (!existingTitles.has(p.title_ar)) {
      insertCourse.run(
        p.title_ar,
        p.title_en,
        p.description_ar,
        p.description_en,
        p.level_id,
        p.teacher_id,
        p.schedule_ar,
        p.schedule_en,
        p.price_monthly,
        p.capacity
      );
    }
  }
}

function seedInitialData() {
  const passHash = hashPassword('Noor2026!');

  // Profiles
  const insertProfile = db.prepare(`
    INSERT INTO profiles (email, password_hash, full_name, role, is_active, preferred_lang)
    VALUES (?, ?, ?, ?, 1, 'ar')
  `);

  const adminId = Number(insertProfile.run('admin@noorbayan.academy', passHash, 'د. سارة المنصور (المدير)', 'admin').lastInsertRowid);
  const teacher1ProfileId = Number(insertProfile.run('fatima@noorbayan.academy', passHash, 'أ. فاطمة الزهراء', 'teacher').lastInsertRowid);
  const teacher2ProfileId = Number(insertProfile.run('yusuf@noorbayan.academy', passHash, 'أ. يوسف الشاذلي', 'teacher').lastInsertRowid);
  const teacher3ProfileId = Number(insertProfile.run('mariam@noorbayan.academy', passHash, 'أ. مريم النجار', 'teacher').lastInsertRowid);
  const student1ProfileId = Number(insertProfile.run('omar.student@noorbayan.academy', passHash, 'عمر خالد', 'student').lastInsertRowid);
  const student2ProfileId = Number(insertProfile.run('jana.student@noorbayan.academy', passHash, 'جنى محمود', 'student').lastInsertRowid);
  const guardian1ProfileId = Number(insertProfile.run('khaled.parent@noorbayan.academy', passHash, 'خالد عبد الرحمن', 'guardian').lastInsertRowid);

  // Levels
  const insertLevel = db.prepare(`
    INSERT INTO levels (code, name_ar, name_en, description_ar, description_en, age_range, order_index, criteria_ar, criteria_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const lvl1 = Number(insertLevel.run(
    'L1-BRAEM',
    'البراعم — تأسيس الحروف ونور البيان',
    'Buds — Arabic Letters & Noor Al-Bayan',
    'التعرف على الحروف العربية بالحركات الثلاث والمدود مع قصار السور بالتلقين السمعي.',
    'Mastering Arabic alphabet sounds, short vowels, and foundational short Surahs through guided repetition.',
    '5 – 7 سنوات',
    1,
    'الانتقال عند إتقان نطق الحروف وقراءة الكلمات الثلاثية بالحركات.',
    'Advance upon reading 3-letter words with Harakat fluently.'
  ).lastInsertRowid);

  const lvl2 = Number(insertLevel.run(
    'L2-NOOR',
    'البيان — الطلاقة القرائية وجزء عمّ',
    'Al-Bayan — Reading Fluency & Juz Amma',
    'إتقان السكون والتنوين والشدة وتطبيقها في تلاوة وحفظ جزء عمّ كاملاً.',
    'Reading fluency with Sukoon, Tanween, Shaddah, and complete memorization of Juz Amma.',
    '7 – 10 سنوات',
    2,
    'الانتقال عند اجتياز اختبار القراءة من المصحف بنسبة 85% وحفظ جزء عمّ.',
    'Advance after scoring 85%+ in Mushaf reading and Juz Amma recitation.'
  ).lastInsertRowid);

  const lvl3 = Number(insertLevel.run(
    'L3-TAJWEED',
    'الإتقان — أحكام التجويد وجزء تبارك',
    'Mastery — Tajweed Rules & Juz Tabarak',
    'تطبيق أحكام النون الساكنة والميم الساكنة والمدود مع حفظ ومراجعة جزء تبارك وما يليه.',
    'Practical Tajweed rules (Noon/Meem Sakinah, Madd) alongside Juz Tabarak memorization.',
    '10 – 14 سنة',
    3,
    'إجازة المستوى بعد تسميع الجزأين بتطبيق عملي لأحكام التجويد.',
    'Level certification upon reciting two Juz with accurate Tajweed application.'
  ).lastInsertRowid);

  // Guardians
  const insertGuardian = db.prepare(`
    INSERT INTO guardians (profile_id, full_name, phone, email, relation)
    VALUES (?, ?, ?, ?, ?)
  `);
  const g1 = Number(insertGuardian.run(guardian1ProfileId, 'خالد عبد الرحمن', '+201012345678', 'khaled.parent@noorbayan.academy', 'الأب').lastInsertRowid);
  const g2 = Number(insertGuardian.run(null, 'نجلاء حسن', '+966509876543', 'naglaa@example.com', 'الأم').lastInsertRowid);

  // Teachers
  const insertTeacher = db.prepare(`
    INSERT INTO teachers (profile_id, name_ar, name_en, bio_ar, bio_en, qualifications_ar, qualifications_en, specialty_ar, specialty_en, avatar_url, hourly_rate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const t1 = Number(insertTeacher.run(
    teacher1ProfileId,
    'أ. فاطمة الزهراء',
    'Ustadha Fatima Al-Zahraa',
    'معلمة قرآن كريم ومناهج نور البيان بخبرة تمتد لأكثر من 9 سنوات في تعليم الأطفال بأساليب تربوية دافئة.',
    'Quran & Noor Al-Bayan educator with 9+ years of gentle, child-centered teaching experience.',
    'إجازة في القراءات العشر · دبلوم التربية الإيجابية للأطفال',
    'Ijazah in the Ten Qiraat · Diploma in Child Educational Psychology',
    'تحفيظ جزء عمّ ونور البيان',
    'Juz Amma & Noor Al-Bayan',
    '/assets/images/teacher_portrait_1.webp',
    180
  ).lastInsertRowid);

  const t2 = Number(insertTeacher.run(
    teacher2ProfileId,
    'أ. يوسف الشاذلي',
    'Ustadh Yusuf Al-Shazly',
    'متخصص في تصحيح التلاوة والتجويد العملي للناشئة، يركز على بناء الثقة الصوتية وحب القرآن.',
    'Tajweed and recitation specialist focused on helping juniors build vocal confidence and love for the Quran.',
    'ليسانس الدراسات الإسلامية · إجازة حفص عن عاصم بسند متصل',
    'B.A. in Islamic Studies · Certified Hafs an Asim Ijazah',
    'التجويد العملي والمراجعة',
    'Practical Tajweed & Revision',
    '/assets/images/teacher_portrait_2.webp',
    200
  ).lastInsertRowid);

  const t3 = Number(insertTeacher.run(
    teacher3ProfileId,
    'أ. مريم النجار',
    'Ustadha Mariam Al-Najjar',
    'خبيرة تأسيس القراءة والكتابة العربية للأطفال الناطقين بالعربية وغير الناطقين بها عبر القصص والألعاب.',
    'Arabic literacy specialist for native and heritage young learners using storytelling and interactive games.',
    'ماجستير تعليم اللغة العربية للناشئة · مدربة معتمدة لمنهج نور البيان',
    'M.A. in Arabic Pedagogy · Certified Noor Al-Bayan Trainer',
    'تأسيس القراءة والكتابة',
    'Arabic Reading & Writing',
    '/assets/images/teacher_portrait_3.webp',
    170
  ).lastInsertRowid);

  // Payout details for Teacher 1 & 2
  db.prepare(`
    INSERT INTO teacher_payout_details (teacher_id, account_holder_name, bank_name, iban)
    VALUES (?, ?, ?, ?)
  `).run(t1, 'فاطمة الزهراء محمد علي', 'مصرف الراجحي', 'SA4480000123608010998812');

  db.prepare(`
    INSERT INTO teacher_payout_details (teacher_id, account_holder_name, bank_name, iban)
    VALUES (?, ?, ?, ?)
  `).run(t2, 'يوسف أحمد الشاذلي', 'البنك الأهلي المصري', 'EG380003000123456789012345678');

  // Students
  const insertStudent = db.prepare(`
    INSERT INTO students (profile_id, guardian_id, student_code, full_name_ar, full_name_en, age, level_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
  `);
  const s1 = Number(insertStudent.run(student1ProfileId, g1, 'NB-2026-101', 'عمر خالد عبد الرحمن', 'Omar Khaled', 8, lvl2).lastInsertRowid);
  const s2 = Number(insertStudent.run(student2ProfileId, g2, 'NB-2026-102', 'جنى محمود حسن', 'Jana Mahmoud', 6, lvl1).lastInsertRowid);
  const s3 = Number(insertStudent.run(null, g1, 'NB-2026-103', 'ليان خالد عبد الرحمن', 'Layan Khaled', 11, lvl3).lastInsertRowid);

  // Courses
  const insertCourse = db.prepare(`
    INSERT INTO courses (title_ar, title_en, description_ar, description_en, level_id, teacher_id, schedule_ar, schedule_en, price_monthly, capacity, is_featured)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const c1 = Number(insertCourse.run(
    'حلقة النور — حفظ جزء عمّ وتصحيح التلاوة',
    'Al-Noor Circle — Juz Amma & Recitation',
    'برنامج تفاعلي لحفظ جزء عمّ مع شرح مبسط لمعاني السور وتطبيق مخارج الحروف في مجموعات صغيرة (6 طلاب كحد أقصى).',
    'Interactive small-group program (max 6 students) to memorize Juz Amma with child-friendly Tafsir and pronunciation practice.',
    lvl2, t1,
    'الأحد والثلاثاء · 5:00 مساءً',
    'Sun & Tue · 5:00 PM AST',
    350, 8
  ).lastInsertRowid);

  const c2 = Number(insertCourse.run(
    'تأسيس القراءة بمنهج نور البيان',
    'Noor Al-Bayan Reading Foundations',
    'رحلة ممتعة لتعلّم الحروف العربية والحركات والمدود والتهجئة السريعة عبر الألعاب والبطاقات المصورة.',
    'A joyful step-by-step journey into Arabic letters, Harakat, Madd, and early reading fluency using visual cards.',
    lvl1, t3,
    'السبت والأربعاء · 4:00 مساءً',
    'Sat & Wed · 4:00 PM AST',
    300, 6
  ).lastInsertRowid);

  const c3 = Number(insertCourse.run(
    'إتقان التجويد وحفظ جزء تبارك',
    'Tajweed Mastery & Juz Tabarak',
    'إتقان أحكام التجويد العملية وتطبيقها مباشرة في التلاوة الأسبوعية مع متابعة دقيقة لكل طالب.',
    'Practical Tajweed rules applied directly during weekly live recitation with individualized feedback.',
    lvl3, t2,
    'الإثنين والخميس · 6:30 مساءً',
    'Mon & Thu · 6:30 PM AST',
    420, 6
  ).lastInsertRowid);

  const c4 = Number(insertCourse.run(
    'نادي القصة العربية والخط الجميل',
    'Arabic Storytelling & Penmanship Club',
    'تنمية الثروة اللغوية والتعبير الشفهي والخط العربي للأطفال بأسلوب قصصي ملهم.',
    'Building Arabic vocabulary, oral expression, and neat handwriting through inspiring stories.',
    lvl2, t3,
    'الجمعة · 3:30 مساءً',
    'Friday · 3:30 PM AST',
    260, 10
  ).lastInsertRowid);

  // Enrollments: Omar in c1 & c4 (Teacher 1 & 3), Jana in c2 (Teacher 3), Layan in c3 (Teacher 2)
  const insertEnroll = db.prepare(`INSERT INTO enrollments (student_id, course_id, status) VALUES (?, ?, 'active')`);
  insertEnroll.run(s1, c1);
  insertEnroll.run(s1, c4);
  insertEnroll.run(s2, c2);
  insertEnroll.run(s3, c3);

  // Lessons + Links
  const insertLesson = db.prepare(`
    INSERT INTO lessons (course_id, title_ar, title_en, lesson_date, start_time, duration_min, objectives_ar, objectives_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertLink = db.prepare(`
    INSERT INTO lesson_links (lesson_id, title_ar, title_en, url, link_type)
    VALUES (?, ?, ?, ?, ?)
  `);

  const l1 = Number(insertLesson.run(c1, 'سورة النبأ (1–20) ومخرج الجوف', 'Surah An-Naba (1–20) & Vocal Madd', '2026-11-15', '17:00', 45, 'تسميع سورة النبأ مع ضبط المدود الطبيعية.', 'Recite An-Naba 1–20 with accurate natural Madd.').lastInsertRowid);
  insertLink.run(l1, 'رابط الحصة المباشرة (Zoom)', 'Live Class Link (Zoom)', 'https://zoom.us/j/98421004512', 'zoom');
  insertLink.run(l1, 'ورقة عمل سورة النبأ PDF', 'Surah An-Naba Worksheet', 'https://noorbayan.academy/materials/naba-1.pdf', 'material');

  const l2 = Number(insertLesson.run(c1, 'سورة النازعات ومراجعة المد المتصل', 'Surah An-Naziat & Connected Madd', '2026-11-17', '17:00', 45, 'مراجعة سورة النبأ والبدء بسورة النازعات.', 'Review An-Naba and begin An-Naziat.').lastInsertRowid);
  insertLink.run(l2, 'رابط الحصة المباشرة (Zoom)', 'Live Class Link (Zoom)', 'https://zoom.us/j/98421004512', 'zoom');

  const l3 = Number(insertLesson.run(c2, 'الحروف اللثوية وحركة الفتحة', 'Interdental Letters & Fatha', '2026-11-16', '16:00', 40, 'تمييز الثاء والذال والظاء مع القراءة.', 'Distinguish Tha, Dhal, and Dha with Fatha.').lastInsertRowid);
  insertLink.run(l3, 'غرفة الصف التفاعلية', 'Interactive Classroom', 'https://meet.google.com/noor-bayan-l1', 'meet');

  const l4 = Number(insertLesson.run(c3, 'أحكام النون الساكنة: الإظهار والإدغام', 'Noon Sakinah: Izhar & Idgham', '2026-11-16', '18:30', 50, 'تطبيق الإظهار والإدغام على سورة الملك.', 'Apply Izhar & Idgham in Surah Al-Mulk.').lastInsertRowid);
  insertLink.run(l4, 'رابط الحصة المباشرة', 'Live Session Link', 'https://zoom.us/j/77231009911', 'zoom');

  // Attendance
  db.prepare(`INSERT INTO attendance (lesson_id, student_id, status, notes, recorded_by) VALUES (?, ?, 'present', 'مشاركة ممتازة', ?)`).run(l1, s1, teacher1ProfileId);
  db.prepare(`INSERT INTO attendance (lesson_id, student_id, status, notes, recorded_by) VALUES (?, ?, 'present', 'حضور منتظم', ?)`).run(l3, s2, teacher3ProfileId);
  db.prepare(`INSERT INTO attendance (lesson_id, student_id, status, notes, recorded_by) VALUES (?, ?, 'present', 'تلاوة منضبطة', ?)`).run(l4, s3, teacher2ProfileId);

  // Exams & Results
  const ex1 = Number(db.prepare(`INSERT INTO exams (course_id, title_ar, title_en, exam_date, max_score) VALUES (?, 'اختبار نصف الجزء الأول (عمّ)', 'Juz Amma Midterm Assessment', '2026-11-10', 100)`).run(c1).lastInsertRowid);
  db.prepare(`INSERT INTO exam_results (exam_id, student_id, score, feedback_ar, feedback_en, graded_by) VALUES (?, ?, 96, 'أداء رائع في المخارج وثبات الحفظ ما شاء الله.', 'Excellent articulation and steady memorization.', ?)`).run(ex1, s1, teacher1ProfileId);

  const ex2 = Number(db.prepare(`INSERT INTO exams (course_id, title_ar, title_en, exam_date, max_score) VALUES (?, 'اختبار الحروف بالحركات', 'Harakat Reading Check', '2026-11-11', 100)`).run(c2).lastInsertRowid);
  db.prepare(`INSERT INTO exam_results (exam_id, student_id, score, feedback_ar, feedback_en, graded_by) VALUES (?, ?, 92, 'تقدم جميل جداً في التهجئة.', 'Wonderful progress in word blending.', ?)`).run(ex2, s2, teacher3ProfileId);

  // Recitations & Evaluations
  db.prepare(`
    INSERT INTO recitations (student_id, course_id, surah_name, ayah_from, ayah_to, tajweed_score, memorization_score, notes_ar, recorded_by)
    VALUES (?, ?, 'سورة النبأ', 1, 30, 94, 98, 'حفظ متقن مع انتباه جيد للغنة.', ?)
  `).run(s1, c1, teacher1ProfileId);

  db.prepare(`
    INSERT INTO recitations (student_id, course_id, surah_name, ayah_from, ayah_to, tajweed_score, memorization_score, notes_ar, recorded_by)
    VALUES (?, ?, 'سورة النازعات', 1, 15, 91, 95, 'تلاوة هادئة ومخارج واضحة.', ?)
  `).run(s1, c1, teacher1ProfileId);

  db.prepare(`
    INSERT INTO evaluations (student_id, course_id, period, behavior_score, participation_score, summary_ar, summary_en, evaluated_by)
    VALUES (?, ?, 'نوفمبر 2026', 98, 95, 'طالب مجتهد ومبادر في الحلقة ويشجع زملاءه.', 'Diligent, respectful student who participates actively in class.', ?)
  `).run(s1, c1, teacher1ProfileId);

  // Announcements & Targets
  const ann1 = Number(db.prepare(`
    INSERT INTO announcements (title_ar, title_en, body_ar, body_en, target_scope, created_by)
    VALUES (?, ?, ?, ?, 'all_students', ?)
  `).run(
    'مسابقة نجوم الحفظ الشهرية',
    'Monthly Quran Stars Challenge',
    'تبدأ مسابقة المراجعة الكبرى يوم السبت القادم لجميع طلاب الأكاديمية مع جوائز وشهادات تقدير.',
    'Our monthly revision challenge begins next Saturday for all students with certificates of merit.',
    adminId
  ).lastInsertRowid);

  const ann2 = Number(db.prepare(`
    INSERT INTO announcements (title_ar, title_en, body_ar, body_en, target_scope, target_course_id, created_by)
    VALUES (?, ?, ?, ?, 'course', ?, ?)
  `).run(
    'موعد المراجعة الجماعية لحلقة النور',
    'Al-Noor Circle Group Review',
    'يرجى تجهيز مصحف الحفظ ومراجعة سورة النبأ كاملة قبل حصة الأحد.',
    'Please review Surah An-Naba completely before Sunday’s live session.',
    c1, adminId
  ).lastInsertRowid);
  void ann1;
  void ann2;

  // Notifications
  db.prepare(`
    INSERT INTO notifications (profile_id, title_ar, title_en, body_ar, body_en)
    VALUES (?, 'تم تقييم تسميعك الجديد', 'New Recitation Evaluated', 'حصلت على 98/100 في تسميع سورة النبأ.', 'You scored 98/100 in Surah An-Naba recitation.')
  `).run(student1ProfileId);

  // Certificates
  db.prepare(`
    INSERT INTO certificates (verification_code, student_id, course_id, title_ar, title_en, grade_label, issued_by)
    VALUES ('NB-CERT-2026-8841', ?, ?, 'شهادة إتمام مستوى البراعم وقصار السور', 'Completion of Buds & Short Surahs Level', 'امتياز · 96%', ?)
  `).run(s1, c1, adminId);

  // Games & Progress
  const gLetters = Number(db.prepare(`
    INSERT INTO games (slug, title_ar, title_en, description_ar, description_en, category, is_public_sample, is_active)
    VALUES ('noor-letters', 'صائد الحروف والحركات', 'Noor Letters & Harakat', 'اختر الحرف الصحيح بالحركة المناسبة واجمع نجوم النور.', 'Catch the matching Arabic letter with its Harakah and collect stars.', 'letters', 1, 1)
  `).run().lastInsertRowid);

  const gMemory = Number(db.prepare(`
    INSERT INTO games (slug, title_ar, title_en, description_ar, description_en, category, is_public_sample, is_active)
    VALUES ('quran-memory', 'ذاكرة الآيات والأرقام', 'Ayah & Numbers Memory', 'طابق الآيات والأرقام العربية بالترتيب الصحيح في جولات ممتعة.', 'Match Quranic verses and Arabic numerals in joyful rounds.', 'memorization', 1, 1)
  `).run().lastInsertRowid);

  const g3d = Number(db.prepare(`
    INSERT INTO games (slug, title_ar, title_en, description_ar, description_en, category, is_public_sample, is_active)
    VALUES ('noor-3d-lantern', 'مرصد الفانوس والحروف ثلاثي الأبعاد', '3D Noor Lantern & Letters Explorer', 'استكشف فانوس العلم ثلاثي الأبعاد واضغط على الكواكب الحرفية لتعلم مخارجها.', 'Explore the 3D Lantern observatory and inspect orbiting Arabic letters.', '3d_explorer', 1, 1)
  `).run().lastInsertRowid);

  db.prepare(`INSERT INTO game_progress (student_id, game_id, score, stars, completed_levels) VALUES (?, ?, 420, 9, 3)`).run(s1, gLetters);
  db.prepare(`INSERT INTO game_progress (student_id, game_id, score, stars, completed_levels) VALUES (?, ?, 310, 6, 2)`).run(s1, gMemory);
  db.prepare(`INSERT INTO game_progress (student_id, game_id, score, stars, completed_levels) VALUES (?, ?, 180, 4, 1)`).run(s1, g3d);

  // Payroll (unique teacher_id + month_year)
  db.prepare(`
    INSERT INTO payroll (teacher_id, month_year, base_amount, bonus_amount, deduction_amount, net_amount, status, paid_at, created_by)
    VALUES (?, '2026-10', 5400, 400, 0, 5800, 'paid', '2026-11-01', ?)
  `).run(t1, adminId);
  db.prepare(`
    INSERT INTO payroll (teacher_id, month_year, base_amount, bonus_amount, deduction_amount, net_amount, status, paid_at, created_by)
    VALUES (?, '2026-10', 6000, 300, 100, 6200, 'paid', '2026-11-01', ?)
  `).run(t2, adminId);

  // Admission request sample
  db.prepare(`
    INSERT INTO admission_requests (student_name, student_age, guardian_name, guardian_email, guardian_phone, preferred_course_id, recommended_level_id, notes, consent_accepted, status)
    VALUES ('سلمى طارق', 7, 'طارق المنياوي', 'tarek.parent@example.com', '+201098765432', ?, ?, 'تحب القصص وتقرأ الحروف منفصلة.', 1, 'pending')
  `).run(c2, lvl1);

  // Legal documents
  const insertLegal = db.prepare(`
    INSERT INTO legal_documents (doc_type, version, title_ar, title_en, content_ar, content_en)
    VALUES (?, '1.0', ?, ?, ?, ?)
  `);
  insertLegal.run(
    'terms',
    'الشروط والأحكام',
    'Terms & Conditions',
    '١. تلتزم أكاديمية نور وبيان بتوفير بيئة تعليمية آمنة ومحفزة للأطفال عبر حصص مباشرة مسجلة ومراقبة تربوياً.\n٢. تُحفظ حقوق الملكية الفكرية لمناهج نور البيان وألعاب الأكاديمية التفاعلية للأكاديمية ولا يجوز إعادة نشرها تجارياً.\n٣. يلتزم ولي الأمر بتوفير اتصال إنترنت مستقر وحضور الطالب في الموعد المحدد، مع إمكانية الاعتذار قبل الحصة بـ 12 ساعة.',
    '1. Noor & Bayan Academy provides a safe, nurturing live online environment for children.\n2. All curriculum worksheets and interactive games remain the intellectual property of the Academy.\n3. Guardians agree to ensure punctual attendance and notify teachers at least 12 hours before any excused absence.'
  );
  insertLegal.run(
    'privacy',
    'سياسة الخصوصية وحماية الطفل',
    'Privacy & Child Safety Policy',
    '١. نلتزم بحماية بيانات الأطفال وأولياء الأمور بشكل كامل وعدم مشاركتها مع أي طرف ثالث.\n٢. لا يتم عرض صور الأطفال الحقيقية أو تسجيلاتهم على الموقع العام تحت أي ظرف.\n٣. يتم تشفير بيانات استلام رواتب المعلمين وإخفاء رقم الآيبان جزئياً في لوحة التحكم، ولا نطلب أو نخزن أي أرقام بطاقات بنكية أو رموز CVV.',
    '1. We strictly protect all student and guardian data and never sell or share records with third parties.\n2. Real photos or videos of children are never published on public pages.\n3. Teacher payout IBAN details are masked in dashboards, and card numbers or CVV codes are never requested or stored.'
  );
  insertLegal.run(
    'refund',
    'سياسة الاسترجاع والفوترة',
    'Refund & Billing Policy',
    '١. يحق لولي الأمر استرداد كامل الرسوم خلال أول أسبوعين من الاشتراك في حال عدم ملاءمة البرنامج للطالب.\n٢. يتم احتساب الحصص الفردية الملغاة من قبل الأكاديمية كرصيد تعويضي فوري في الشهر التالي.',
    '1. Guardians may request a full refund within the first 14 days of enrollment if the program is not a fit.\n2. Any session cancelled by the Academy is automatically credited toward the following month.'
  );

  // Testimonials (only approved ones show publicly)
  const insertTestimonial = db.prepare(`
    INSERT INTO testimonials (guardian_name_ar, guardian_name_en, relation_ar, relation_en, quote_ar, quote_en, student_outcome_ar, student_outcome_en, is_approved)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  insertTestimonial.run(
    'أم عمر (خالد عبد الرحمن)',
    'Um Omar (Khaled Family)',
    'والدة طالب في حلقة النور',
    'Parent · Al-Noor Circle',
    'كان ابني يتردد في القراءة الجهرية، وبعد 4 أشهر مع الأستاذة فاطمة أصبح يقرأ جزء عمّ بطلاقة وينتظر موعد الحلقة بشغف.',
    'My son used to hesitate reading aloud. After 4 months with Ustadha Fatima, he reads Juz Amma confidently and eagerly awaits every class.',
    'حفظ 18 سورة خلال 4 أشهر',
    'Memorized 18 Surahs in 4 months'
  );
  insertTestimonial.run(
    'د. عبد الله المنصور',
    'Dr. Abdullah Al-Mansour',
    'والد طالبة في مستوى الإتقان',
    'Parent · Mastery Level',
    'أكثر ما يطمئنني في نور وبيان هو وضوح التقارير الأسبوعية والانضباط التربوي في الحصص دون أي تشتيت.',
    'What gives me peace of mind at Noor & Bayan is the transparent weekly evaluation and calm, focused classroom discipline.',
    'اجتياز اختبار التجويد بنسبة 96%',
    'Scored 96% in Tajweed Assessment'
  );
  insertTestimonial.run(
    'نجلاء حسن',
    'Naglaa Hassan',
    'والدة طالبة في مستوى البراعم',
    'Parent · Buds Level',
    'الألعاب التعليمية ساعدت ابنتي على ربط الحروف بالحركات في المنزل بمتعة حقيقية بدلاً من الحفظ الممل.',
    'The interactive letter games helped my daughter connect Arabic letters with Harakat joyfully at home.',
    'إتقان الحروف والحركات في 6 أسابيع',
    'Mastered Harakat in 6 weeks'
  );

  // Initial Audit Log
  db.prepare(`
    INSERT INTO audit_logs (actor_id, actor_name, action, entity_type, entity_id, details_json)
    VALUES (?, 'د. سارة المنصور', 'SYSTEM_SEED', 'academy', '1', '{"note":"تهيئة بيانات أكاديمية نور وبيان الأساسية"}')
  `).run(adminId);
}
