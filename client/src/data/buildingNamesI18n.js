// Building/gate display names in languages beyond zh-TW/en, for the
// "bilingual signage" feature: when the visitor's UI language is ja/ko/vi/id/
// th, building name displays show "中文名 / 該語言名" so the Chinese half can
// still be visually matched against the real physical signage on campus
// (which is Chinese + English only — there is no official ja/ko/vi/id/th
// signage at FCU). These translations are AI best-effort translations of the
// generic building-type meaning (the same approach used for the English
// names, e.g. "Library" rather than a phonetic transliteration), not an
// official multilingual source — flagged here and in README.md. Keyed by the
// building id used in src/data/buildings.json / gates.json. Any building not
// listed here simply falls back to its English name for the second half of
// the bilingual pair (see src/utils/bilingual.js).
export const BUILDING_NAMES_I18N = {
  b283040788: { ja: '行政棟', ko: '행정관', vi: 'Tòa nhà Hành chính', id: 'Gedung Administrasi', th: 'อาคารบริหาร' }, // 行政大樓
  r6032176: { ja: '行政第二棟', ko: '제2행정관', vi: 'Tòa nhà Hành chính II', id: 'Gedung Administrasi II', th: 'อาคารบริหาร 2' }, // 行政二館
  b283040785: { ja: '丘逢甲記念館', ko: '추펑자 기념관', vi: 'Nhà tưởng niệm Khâu Phùng Giáp', id: 'Aula Peringatan Chiu Feng-Chia', th: 'หอรำลึกชิว เฟิงเจีย' }, // 丘逢甲紀念館
  b283040786: { ja: '理工・航空宇宙工学館', ko: '과학항공우주관', vi: 'Tòa nhà Khoa học và Kỹ thuật Hàng không Vũ trụ', id: 'Gedung Sains dan Teknik Kedirgantaraan', th: 'อาคารวิทยาศาสตร์และวิศวกรรมการบิน' }, // 科學與航太館
  b254446750: { ja: '商学館', ko: '경영대학관', vi: 'Tòa nhà Kinh doanh', id: 'Gedung Bisnis', th: 'อาคารบริหารธุรกิจ' }, // 商學大樓
  b262625997: { ja: '図書館', ko: '도서관', vi: 'Thư viện', id: 'Perpustakaan', th: 'หอสมุด' }, // 圖書館
  b406370377: { ja: '忠勤楼', ko: '충근루', vi: 'Tòa nhà Trung Cần', id: 'Gedung Jong-Chin', th: 'อาคารจงฉิน' }, // 忠勤樓
  r6032175: { ja: '工学館', ko: '공학관', vi: 'Tòa nhà Kỹ thuật', id: 'Gedung Teknik', th: 'อาคารวิศวกรรมศาสตร์' }, // 工學館
  b260864150: { ja: '情報電機館', ko: '정보전기관', vi: 'Tòa nhà Công nghệ Thông tin và Điện', id: 'Gedung Teknik Informatika dan Elektro', th: 'อาคารวิศวกรรมสารสนเทศและไฟฟ้า' }, // 資訊電機館
  b402105180: { ja: '建築館', ko: '건축관', vi: 'Tòa nhà Kiến trúc', id: 'Gedung Arsitektur', th: 'อาคารสถาปัตยกรรม' }, // 建築館
  b283040765: { ja: '語学館', ko: '어학관', vi: 'Tòa nhà Ngoại ngữ', id: 'Gedung Bahasa', th: 'อาคารภาษา' }, // 語文大樓
  b283040784: { ja: '迎賓館（ヒストリーハウス）', ko: '제1영빈관(히스토리하우스)', vi: 'Nhà khách số 1 (History House)', id: 'Wisma Tamu Pertama (History House)', th: 'เรือนรับรองที่ 1 (History House)' }, // 第一招待所
  b283040764: { ja: '人言楼', ko: '런옌관', vi: 'Tòa nhà Renyan', id: 'Gedung Renyan', th: 'อาคารเหรินเหยียน' }, // 人言大樓
  b283040771: { ja: '人文社会館', ko: '인문사회관', vi: 'Tòa nhà Nhân văn và Khoa học Xã hội', id: 'Gedung Humaniora dan Ilmu Sosial', th: 'อาคารมนุษยศาสตร์และสังคมศาสตร์' }, // 人文社會館
  b283040772: { ja: '電子通信館', ko: '전자통신관', vi: 'Tòa nhà Điện tử và Viễn thông', id: 'Gedung Elektronika dan Telekomunikasi', th: 'อาคารอิเล็กทรอนิกส์และการสื่อสาร' }, // 電子通訊館
  b262625994: { ja: '育楽館', ko: '육락관', vi: 'Tòa nhà Giải trí', id: 'Gedung Rekreasi', th: 'อาคารนันทนาการ' }, // 育樂館
  b283040768: { ja: '土木水利館', ko: '토목수리관', vi: 'Tòa nhà Kỹ thuật Xây dựng và Thủy lợi', id: 'Gedung Teknik Sipil dan Hidraulika', th: 'อาคารวิศวกรรมโยธาและชลศาสตร์' }, // 土木水利館
  b283040766: { ja: '理学館', ko: '이학관', vi: 'Tòa nhà Khoa học', id: 'Gedung Sains', th: 'อาคารวิทยาศาสตร์' }, // 理學大樓
  b397387971: { ja: '文華イノベーションセンター', ko: '원화 혁신센터', vi: 'Trung tâm Sáng tạo Wenhwa', id: 'Pusat Inovasi Wenhwa', th: 'ศูนย์นวัตกรรมเหวินหัว' }, // 文華創意中心
  b283040769: { ja: '学思楼', ko: '학사루', vi: 'Tòa nhà Xuesi', id: 'Gedung Xuesi', th: 'อาคารเสว่ซือ' }, // 學思樓
  b405246747: { ja: '学思園', ko: '학사원', vi: 'Vườn Xuesi', id: 'Taman Xuesi', th: 'สวนเสว่ซือ' }, // 學思園
  b283040778: { ja: '体育館', ko: '체육관', vi: 'Trung tâm Thể thao', id: 'Gedung Olahraga', th: 'อาคารกีฬา' }, // 體育館
  b283040780: { ja: '逢甲スマートイノベーション港（i-Hub）', ko: '펑자 스마트혁신허브(i-Hub)', vi: 'Cảng Đổi mới Thông minh i-Hub', id: 'i-Hub Pelabuhan Inovasi Cerdas', th: 'ไอ-ฮับ ศูนย์นวัตกรรมอัจฉริยะ' }, // 逢甲智慧創新港
  r20159319: { ja: '共善楼（ヴァーチュオージホール）', ko: '공산루(Virtuosi Hall)', vi: 'Tòa nhà Virtuosi (Cộng Thiện Lâu)', id: 'Gedung Virtuosi (Gongshan)', th: 'อาคารกงซั่น (Virtuosi Hall)' }, // 共善樓
}

export const GATE_NAMES_I18N = {
  'gate-west': { ja: '西門（正門）', ko: '서문(정문)', vi: 'Cổng Tây (Cổng chính)', id: 'Gerbang Barat (Gerbang Utama)', th: 'ประตูตะวันตก (ประตูหลัก)' },
  'gate-east': { ja: '東門', ko: '동문', vi: 'Cổng Đông', id: 'Gerbang Timur', th: 'ประตูตะวันออก' },
  'gate-north': { ja: '北門', ko: '북문', vi: 'Cổng Bắc', id: 'Gerbang Utara', th: 'ประตูเหนือ' },
  'gate-south': { ja: '南門', ko: '남문', vi: 'Cổng Nam', id: 'Gerbang Selatan', th: 'ประตูใต้' },
}
