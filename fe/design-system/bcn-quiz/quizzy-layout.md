# BCN Quiz — Bố cục mới theo Figma, màu web cũ

Ngày: 06/11/2026. Làm trên file `fe-2.rar` anh gửi lại (có thêm luồng yêu cầu
chứng nhận + trang Xếp hạng tuần). Mọi sửa đổi của anh trong fe-2 được giữ
nguyên; chỉ thêm bố cục bên dưới.

## Login — giữ nguyên như cũ

Trang đăng nhập (`src/app/page.tsx`, class `.landing*`) không đổi: layout
landing SSO cũ, màu cũ. Không dùng bố cục chia đôi Figma nữa (bản v2 đã bỏ).

## Màu — dùng lại màu web cũ

- Không có file theme tím nào. Chỉ thêm 1 file bố cục
  `src/app/styles/quizzy-layout.css`, và 1 dòng import nó trong
  `src/app/layout.tsx` (sau `globals.css`).
- File bố cục chỉ dùng biến màu gốc trong `globals.css`
  (`--accent: #087f65`, `--accent-strong: #06644f`,
  `--accent-soft: #d8f2e9`, ...), không chứa mã màu tím nào.
- Gradient/hero/topic cũ trong `globals.css` giữ nguyên.

## Bố cục — theo các khung Figma Quizzy (kịch bản 05/11/2026 đã duyệt)

- Khung chung (`app-shell.tsx`): sidebar 212px; topbar có nút
  "+ Tạo khóa học" (chỉ tài khoản quản trị, sang trang Quản trị).
- Tổng quan (`dashboard/page.tsx`): 4 thẻ số liệu thật + 2 cột
  (Khóa học gần đây / Làm bài gần đây, lấy từ `/attempt/sessions/me`).
- Khóa học (`courses/page.tsx`): thẻ lớn chứa tìm kiếm + tab lọc
  Tất cả / Đang học / Đã hoàn thành (lọc từ dữ liệu tiến độ đã tải)
  + danh sách dòng thẻ ngang.
- Chi tiết khóa học (`courses/[id]/page.tsx`): nút quay lại + 4 thẻ số
  liệu + mục Chứng nhận của anh (giữ nguyên) + 2 cột (Chủ đề / Project).
- Làm bài (`topics/[id]/page.tsx`): toàn màn hình khi đang làm
  (ẩn sidebar/topbar qua class `quiz-playing` trên body), topbar riêng,
  thanh tiến trình, đáp án lưới 2×2, cột phải Danh sách câu + Nộp bài.
  Autosave, cờ, phím tắt, resume giữ nguyên.
- Quản trị (`admin/page.tsx`): form 2 cột (Thông tin / Cấu hình, rộng
  tối đa 880px, danh sách nằm dưới), menu ⋮ mỗi dòng chỉ Sửa/Xóa.
  Tab "Chứng nhận" mới của anh giữ nguyên.
- Bảng xếp hạng tuần (`leaderboard/page.tsx`, mới của anh): dùng chung
  component bảng, không sửa gì thêm.

## Không đổi

API, điều kiện quyền, thứ tự dữ liệu, logic nộp/lưu/chấm — chỉ đổi JSX
bố cục và thêm class. Mock API chỉ dùng để quay video demo, không có
trong file giao.

## Nhật ký thay đổi

- 06/11/2026 (tối): khung minh họa quiz ở trang login chưa responsive —
  sửa trong `globals.css` (khung cao theo nội dung, chữ `clamp()`,
  đáp án đúng dùng flex cho ✓ dính với chữ).
- 06/11/2026 (tối, anh duyệt kịch bản): bỏ hẳn khung minh họa cũ
  (nền xanh đậm + lớp xanh nhạt nghiêng + thẻ quiz trắng), thay bằng
  cụm laptop + tablet + điện thoại xếp như hình mẫu anh gửi.
  Màn hình laptop chạy video thao tác làm quiz thật
  (`public/brand/demo-quiz.mp4`, 21 giây, 170KB, quay bằng Playwright
  với mock API, chạy lặp không tiếng); màn hình tablet dùng ảnh Tổng
  quan, màn hình điện thoại dùng ảnh làm bài
  (`public/brand/shot-dashboard.png`, `shot-quiz.png`). CSS cụm thiết
  bị trong `globals.css` (`.devices`, `.device-laptop/tablet/phone`),
  mọi kích thước theo % nên tự co theo màn hình.
- 06/11/2026 (tối, anh góp ý): màn hình điện thoại đổi sang ảnh chụp
  từ giao diện mobile thật (`public/brand/shot-quiz-mobile.png`,
  390×844, câu hỏi + đáp án đã chọn + nút Câu tiếp) thay cho ảnh
  desktop bị cắt; laptop trong bản code không có thanh tiến độ video
  (video thuần, không controls). Lưu ý kỹ thuật: build có 1 lần lỗi
  chập chờn ở `next/font` (JetBrains_Mono) rồi chạy lại thì pass —
  không phải do code đổi.
- 06/11/2026 (tối, anh duyệt): làm mỏng viền thiết bị — laptop
  10→6px, tablet 8→5px, điện thoại 6→4px, đế laptop 12→8px
  (`globals.css`, `.device-*-screen`); bản trong app sửa tương ứng.
- 06/11/2026 (tối, anh yêu cầu): lời chào demo đổi thành
  'Chào BCN_er' thay cho tên thật — user demo trong mock API đổi
  từ 'Anh Đinh (Demo)' thành 'BCN_er', ảnh tablet chụp lại
  (`shot-dashboard.png`); bản trong app sửa tương ứng. Lưu ý: lần
  kiểm tra ngay sau `npm run build` mà dev server đang chạy có thể
  báo tràn ngang 968px giả do CSS dev cũ chưa cập nhật — kiểm tra
  lại bằng dev server khởi động mới thì hết.
- 07/11/2026 (anh yêu cầu): sửa màn hình tablet — ảnh Tổng quan chụp
  lại đúng tỉ lệ dọc 3:4 (600×800) thay cho ảnh ngang 800×500 cũ nên
  không còn bị `object-fit: cover` cắt mất chữ 'Chào' (`shot-dashboard.png`);
  chỉnh vị trí tablet + điện thoại so le cho đẹp — tablet nhấc lên
  (`bottom: 9%`), điện thoại giữ đáy và hơi chồng lên mép phải tablet
  (`left: 33%`); bản trong app sửa tương ứng (tablet `bottom: 10%`,
  điện thoại `left: 32%`). Đã kiểm tra login ở 1440/768/390, build pass.
- 07/11/2026 (anh yêu cầu): thêm đổ bóng cho cả 3 thiết bị
  (`filter: drop-shadow` trên `.device-*`); video thao tác trên laptop
  chạy chậm lại 0.75x (`playbackRate`, `page.tsx`); quay lại video
  `demo-quiz.mp4` (23,4 giây, 235KB) có con trỏ chuột giả đi theo chuột
  thật trong lúc quay; chuyển điện thoại sang bên phải màn hình laptop
  (laptop thu lại `left: 2%, width: 74%`, điện thoại `right: 0, width: 24%`).
  Đã kiểm tra login ở 1440/768/390, build pass.

## Kiểm chứng

```bash
npm install
npm run build   # phải pass trước khi gọi là xong
npm run dev     # http://localhost:5173
```
- 07/11/2026 (anh đổi ý, chỉ bỏ điện thoại sang phải): điện thoại về lại
  giữa (`left: 33%`), laptop về lại phải (`width: 82%`); giữ nguyên đổ
  bóng 3 thiết bị, video laptop 0.75x, video có con trỏ chuột. Đã kiểm
  tra login ở 1440/768/390, build pass.
- 07/11/2026 (anh góp ý video chỉ đúng 1 câu + hơi lag giật): quay lại
  video `demo-quiz.mp4` — trả lời ĐÚNG cả 5 câu (A/C/C/B/B), kết quả
  50/50 điểm, Đúng 5/5, Chính xác 100%; chuột di mượt (chia 10 đoạn,
  dừng 100ms mỗi đoạn) + nén nội suy khung hình lên 30fps đều
  (minterpolate) cho hết giật. Video mới 37,3 giây, 390KB, vẫn chạy
  0.75x trên trang login. Đã kiểm tra login ở 1440/768/390, build pass.
- 07/11/2026 (anh nói video vẫn giật lag): nguyên nhân chính là video
  trắng 4–9 giây do dev server biên dịch lạnh lúc quay + chuột nhảy
  từng cục (10 đoạn × 100ms) + chạy 0.75x trên video 30fps chỉ còn
  22,5fps. Quay lại có warm-up trước (hết trắng, 38,8 giây), chuột di
  liên tục 40 đoạn × 20ms, nén nội suy lên 60fps (chạy 0.75x vẫn còn
  45fps), crf 25. Video mới 38,7 giây, 620KB, kết quả vẫn 5/5 đúng.
  Đã kiểm tra login ở 1440/768/390, build pass.
- 07/11/2026 (anh nói bỏ đoạn load lúc vừa mới đăng nhập xong): cắt 3,5 giây
  đầu video — đoạn trắng + "Đang xác thực phiên BCN..." + "Đang chuẩn bị
  bài quiz..." (khung skeleton). Video mới bắt đầu thẳng từ trang chủ đề
  đã load xong, dài 35,2 giây, 569KB, 60fps, kết quả vẫn 5/5 đúng.
  Đã kiểm tra login ở 1440/768/390, build pass.
- 07/11/2026 (anh nói tiêu đề hơi xấu, chọn phương án D): tiêu đề login đổi
  sang Be Vietnam Pro 800 (load qua next/font/google, subset vietnamese),
  tách 2 dòng "Luyện đúng trọng tâm." (đen) / "Tiến bộ thấy rõ." (teal
  #087f65), line-height 1.12, letter-spacing -.02em. Cỡ chữ theo cột hẹp:
  desktop tối đa 50px, tablet 60px, mobile 30px — 2 dòng không bị ngắt ở
  cả 3 cỡ. Bản app đồng bộ cùng phương án D. Đã kiểm tra login ở
  1440/768/390, build pass.
- 07/11/2026 (anh nói video laptop nhanh lên xíu): tốc độ phát video từ
  0.75x lên 0.9x (video 60fps nên chạy 0.9x vẫn còn 54fps, vẫn mượt).
  Đã kiểm tra login desktop, build pass.
- 07/11/2026 (anh nói góc màn hình tablet/điện thoại có logo Next): logo
  "N" là dev indicator của Next.js, bị dính vào 2 ảnh chụp cũ vì chụp
  lúc chạy dev server. Chụp lại 2 ảnh shot-dashboard.png (600×800) và
  shot-quiz-mobile.png (390×844) bằng production server nên hết logo.
  Script chụp lại lưu ở demo/reshoot-brand.mjs. Đã kiểm tra login
  desktop, build pass.
- 07/11/2026 — Aside trái (Phần 2, bước 1): profile ở cuối aside chỉ còn avatar + tên + email; bấm vào mở thẻ hồ sơ kiểu Discord (avatar lớn, tên, email, Vai trò + link "Xem role mọi app", Chứng nhận tải từ /certificate/requests/me kèm trạng thái, nút Đăng xuất). Bỏ nút theme khỏi aside (nút theme ở topbar vẫn giữ). Thẻ đóng khi bấm ra ngoài, bấm Escape hoặc chuyển trang.
  Đã kiểm tra Dashboard 1440/768/390 (cả trạng thái thẻ mở), build + lint pass.
- 07/11/2026 — Aside rộng hơn (Phần 2): sidebar desktop từ 212px lên 288px để họ tên dài không bị cắt; .main-column margin-left đổi theo. Mobile giữ drawer 264px như cũ.
  Đã đo thật: tên "Nguyễn Trần Minh Quân" (22 ký tự) cần 181px; 264px vẫn thiếu 12px nên phải lên 288px (chỗ tên ~193px) mới hiển thị đủ, không bị cắt.
- 07/11/2026 — Đổi từ "chứng chỉ" sang "chứng nhận" (Phần 2): toàn bộ text UI tiếng Việt (tab, trang Chứng nhận, Xác minh, trạng thái, admin duyệt, thẻ profile) — 38 chỗ trong 9 file src; giữ nguyên route /certificates, API /certificate/..., tên biến/hàm/file tiếng Anh.
- 07/11/2026 — Dashboard: cột phải "Làm bài gần đây" đổi thành "Cần hoàn thành" (Phần 2, phương án B anh duyệt; hoàn thành = đã nộp là đủ). Hiện topic đang mở (availability OPEN) của khóa học chưa hoàn thành mà user chưa nộp bài; topic đang làm dở hiện "Đang làm x/y câu" + nút "Tiếp tục", topic chưa mở lần nào nút "Làm bài". Khóa đã hoàn thành không hiện (tránh mâu thuẫn với thẻ "Đã hoàn thành"). Lúc trống: "Chưa có bài tập cần hoàn thành". Link "Xem tất cả" sang trang Khóa học. Không sửa DB/BE: chỉ dùng API sẵn có (/course/progress/me, /course/:id/topics, /attempt/sessions/me), tải hết các trang phân trang (50 mục/trang). Demo hiện 3 mục: Dependency Injection & Provider (Làm bài), Database với Prisma (Tiếp tục, 1/3 câu), Next.js App Router (Làm bài). Đã kiểm tra Dashboard 1440/390 và trạng thái trống, build + lint pass.
- 07/11/2026 — Giới hạn hiển thị ở Dashboard (Phần 2): "Khóa học gần đây" chỉ hiện tối đa 2 khóa (xem thêm qua "Xem tất cả" → /courses; vẫn tải đủ 6 khóa để tính 4 thẻ số liệu). "Cần hoàn thành" tối đa 4 hàng, quá thì trượt dọc trong khung .todo-list (max-height 360px, overflow-y auto; bỏ giới hạn slice 5 mục cũ để bài thừa vẫn trượt tới được). Đã kiểm tra: desktop chỉ hiện 2 khóa, số liệu vẫn đủ (Đang học 2 / Đã hoàn thành 1 / TB 68%); thử 5 bài cần làm: khung cao 360px, scrollHeight 445px, cuộn xuống hiện đủ mục thứ 5; mobile 390 không vỡ layout. Build + lint pass.
- 07/11/2026 — Sửa lỗi responsive ở header (anh gửi ảnh): dòng "Học chắc từng chủ đề" ở topbar bị gãy 2 dòng + cắt chữ trên điện thoại (390px) vì span không có giới hạn, trong khi nút menu + "Tạo khóa học" + chuông + theme đã chiếm gần hết chiều rộng. Cách sửa: thêm class .topbar-tagline cho span, ẩn dòng này ở <=680px (điện thoại); tablet/desktop vẫn hiện bình thường. Đã kiểm tra topbar ở 390/768/1440: mobile chỉ còn nút menu + Tạo khóa học + chuông + theme trên 1 dòng, không gãy chữ. Build + lint pass. Lưu ý: lúc chụp lần đầu gặp lỗi client-side do build lại trong khi prod server cũ vẫn chạy (chunk cũ bị thay) — phải kill server cũ, build lại sạch rồi mới chạy prod server mới.
- 07/11/2026 — Xóa dòng eyebrow (chữ nhỏ trên tiêu đề trang) ở 12 chỗ trong (app): Dashboard ("Tổng quan" trên "Chào ..."), Khóa học ("Thư viện học tập"), chi tiết khóa học ("Lộ trình học"), Xếp hạng ("Toàn hệ thống"), Lịch sử ("Hoạt động của bạn"), chi tiết lần làm, Chứng nhận ("Thành tựu"), Quản trị ("Quản trị nội dung"), leaderboard topic, và 3 chỗ ở trang topic (tên topic lúc chưa mở, "Kết quả", "Chủ đề"). Giữ lại 2 chỗ không phải tab: trang Đăng nhập ("Học tập dành cho BCN") và trang Xác minh ("Xác minh công khai"). Đã kiểm tra header Dashboard/Khóa học/Xếp hạng ở desktop, không còn khoảng trống thừa. Build + lint pass.
- 07/11/2026 — Tab Khóa học đổi sang dạng thẻ (Phần 3): bỏ danh sách dòng ngang, dùng lại CourseCard (ảnh bìa — có ảnh thì hiện ảnh, chưa có thì nền teal + icon sách; tên khóa học; số chủ đề; trạng thái + tiến độ nếu đã học; bấm vào thẻ là vào học) trong lưới grid-3: desktop 3 thẻ/hàng, tablet (<=900px) 2 thẻ/hàng, mobile 1 thẻ/hàng; khóa tiếp theo xuống dòng. Bỏ hẳn số người tham gia theo ý anh (dữ liệu Course không có trường đó). Xóa CSS dòng ngang đã chết (.course-rows/.course-row* + block 680px, 84 + 11 dòng). Đã kiểm tra Khóa học 1440/768/390: desktop 3 thẻ 1 hàng, tablet 2 thẻ 1 hàng (hàng 3 không còn bị gãy chữ "Hoàn thành"), mobile 1 thẻ 1 hàng. Build + lint pass.
- 08/11/2026 — Đồng bộ code từ fe-3.rar (sau merge main): nhận 3 file chứng nhận mới từ remote (admin-certificates.tsx duyệt hàng loạt/bulk-approve + thu hồi, types.ts thêm BulkApproveResult, e2e chứng nhận thêm test bulk-approve) + pnpm-workspace.yaml; khôi phục 4 file gốc mà rar thiếu (.gitignore, .env.example, Dockerfile, .dockerignore). Sửa 1 chữ sót trong bulk-approve mới: "được cấp chứng chỉ" → "được cấp chứng nhận" (admin-certificates.tsx:196). Hiệu ứng chuyển tab Khóa học: viên nền teal trượt theo nút đang chọn (transform + width, 0.28s, đo vị trí thật bằng offsetLeft/offsetWidth, đo lại khi đổi tab/tải xong/resize/font load); nút đang chọn trong suốt để lộ viên nền, chữ trắng. Đã kiểm tra: viên nền khớp đúng vị trí/rộng của nút đang chọn ở cả 3 tab, giữa lúc trượt nằm đúng giữa 2 nút. Build + lint pass.
- 08/11/2026 — Bảng xếp hạng tuần (Phần 5, anh chốt chỉ làm theo tuần, không làm tháng/toàn thời gian): gọn đầu trang — bỏ lịch chọn ngày, bỏ chip lọc ("Theo tuần", "Tuần ... · giờ Việt Nam"), bỏ dòng "Cập nhật lúc ... · không tự động làm mới"; chỉ giữ dòng kỳ "Tuần 02/11 → 08/11 · giờ Việt Nam" (ngày dạng DD/MM, helper fmtDay) + nút "Làm mới"; ghi chú gọn còn 1 dòng ("Bạn đã làm X/Y topic. Chỉ lần làm đầu tiên của mỗi topic được cộng điểm."). Huy hiệu hạng mới (component RankBadge trong leaderboard-table.tsx, dùng chung cho podium + bảng + thẻ "Hạng của bạn"): Top 1 cúp vàng + số 1, Top 2 cúp bạc + số 2, Top 3 cúp đồng + số 3 (icon Trophy fill); 4-10 oval kem, 11+ oval xám. Bảng ngày trong từng topic giữ nguyên lịch/chip (không đổi). Đã kiểm tra: build + lint + tsc sạch; Bảng xếp hạng 1440/390 và toàn trang (cúp 1-3, oval kem 4-10, oval xám 11-12 kiểm chứng bằng 4 user tạm trong mock rồi hoàn nguyên).
- 08/11/2026 — Huy hiệu cúp 1-3 (Phần 5, anh góp ý: lấy icon cúp rồi đè số lên, không làm pill thủ công): Top 1-3 giờ chỉ còn icon cúp Trophy fill (vàng #d97706, bạc #9ca3af, đồng #b45309), số hạng đè lên trên bầu cúp (top 30%, căn giữa); số trắng trên cúp vàng/đồng, số tối #1f2937 trên cúp bạc. Bỏ nền pill ở cúp 1-3; oval kem 4-10 và oval xám 11+ giữ nguyên. Đã kiểm tra: build + lint sạch; chụp phóng to thấy số 1/2/3 nằm gọn trên bầu cúp, đọc rõ ở cả podium (cúp lớn 36px) lẫn bảng (cúp 26px), mobile 390 không vỡ.
- 08/11/2026 — Sửa 2 điểm anh báo ở Phần 5: (1) Số trên cúp chưa vô giữa — hạ số từ top 30% xuống top 38% chiều cao cúp nên số nằm giữa bầu cúp; đã chụp phóng to kiểm tra số 1/2/3 nằm gọn giữa bầu cúp ở cả podium lẫn bảng. (2) Huy hiệu hạng ở aside (bản code): thêm vào app-shell.tsx — AppShell tải /leaderboards/weekly?limit=1 lấy currentUserRank, hiện RankBadge (nhỏ) ở cuối mục "Xếp hạng" trong nav (class .nav-rank, margin-left auto); không có hạng thì không hiện. Huy hiệu ở nav dùng kem đậm hơn (22% warning) + viền + bóng nhẹ để nổi trên cả nền trắng lẫn nền mint của hàng đang chọn (bản app cũng sửa tương tự: cúp vẽ lại dạng đặc, số ở 35%).
- 08/11/2026 — Số trên cúp vẫn lệch sau khi hạ top 30% -> 38%: đo thật bằng pixel + DOM mới thấy lỗi nằm ở CHIỀU NGANG, không phải dọc. Chữ số "1" trong font bị lệch trái ~1px so với tâm hộp chữ (nét số nằm lệch trái trong advance width), nên nhìn như số chưa vô giữa cúp dù top đã đúng. Sửa: .rank-cup-num thêm nudge ngang translate(calc(-50% + 0.07em), -50%) để bù đúng phần lệch của chữ số; giữ top 38%. Đo lại bằng DOM: tâm span số lệch +0.98px (cúp lớn) / +0.77px (cúp nhỏ) so với tâm cúp, trừ đi độ lệch trái của nét số thì số "1" về đúng tâm cúp cả ngang lẫn dọc (podium + bảng).
- 08/11/2026 — Số trên cúp vẫn chưa vô giữa (anh báo lần 3): nguyên nhân là Range/DOM đo hộp dòng (line box) chứ không đo MỰC glyph — mực số "1" nằm cao trong hộp dòng nên nhìn vẫn lệch lên dù hộp dòng đã đúng tâm bầu. Sửa: hạ top 38% -> 42.5% để TÂM MỰC số trùng tâm bầu cúp (khớp cách sửa bên app); đồng thời giảm nudge ngang 0.07em -> 0.035em vì 0.07em đẩy quá 1px sang phải. Đo lại bằng pixel trên bản render thật (Be Vietnam Pro): tâm mực số lệch dọc +0.5px, lệch ngang 0.0px so với tâm bầu/tâm cúp — coi như đã vô giữa ở cả cúp lớn (podium) lẫn cúp nhỏ (bảng, aside).
- 08/11/2026 — Theo yêu cầu anh: (1) Bỏ hẳn thẻ xanh lá "Hạng của bạn" khỏi trang Xếp hạng (topic-leaderboard.tsx) — hạng của mình vẫn thấy ở huy hiệu aside + dòng tô sáng trong bảng; giữ lại câu "Bạn chưa có kết quả trong kỳ này" khi chưa có kết quả; dọn biến onThisPage + import pageOfRank thừa và 5 rule CSS .leaderboard-me chết. (2) Đầu trang Xếp hạng: kéo dòng kỳ "Tuần 02/11 → 08/11 · giờ Việt Nam" sát lại tiêu đề "Bảng xếp hạng tuần" và đưa nút "Làm mới" lên cao — giảm margin-top của .leaderboard-toolbar từ 18px xuống 6px (khe còn ~10px).
- 08/11/2026 — Theo yêu cầu anh: (1) Bỏ 2 dòng gợi ý ở trang Xếp hạng — dòng tiến độ "Bạn đã làm X/Y topic..." và dòng "Hiện chỉ có mình bạn trên bảng trong kỳ này" (topic-leaderboard.tsx); dọn biến onlyMe thừa. (2) Đưa nút "Làm mới" lên cùng hàng với tiêu đề "Bảng xếp hạng tuần" (chuyển nút từ .leaderboard-toolbar vào .section-title); dòng kỳ vẫn sát dưới tiêu đề; trạng thái cập nhật của chế độ ngày vẫn ở toolbar. (3) Top 3 giữ sẵn 3 vị trí 2-1-3 kể cả khi chưa đủ 3 người — CHƯA CODE, đang gửi demo để anh duyệt trước.
- 08/11/2026 — Top 3 giữ sẵn 3 vị trí 2-1-3 ĐÃ CODE (anh duyệt demo): topic-leaderboard.tsx luôn render 3 ô hạng 1/2/3 (DOM 1-2-3, hiển thị 2-1-3 qua order ở .leaderboard-slot); ô thiếu người là placeholder viền đứt nét + cúp mờ + cành lá mờ + dòng "Chưa có người đạt hạng này". Cúp bục (PodiumCup mới trong leaderboard-table.tsx) có cành lá nguyệt quế SVG 2 bên: vàng (#d97706/#b45309) hạng 1, bạc (#98a2ad/#6f7a86) hạng 2, đồng (#b0793f/#8a5a2b) hạng 3; cành phải lật gương scaleX(-1); ô trống mờ opacity .55. Dưới mỗi thẻ là bậc teal (.leaderboard-step) với số trắng đậm 900 + bóng nhẹ: hạng 1 cao 52px nền accent, hạng 2 cao 36px teal 70%, hạng 3 cao 24px teal 45%; mobile số 16px, bậc thấp hơn, cành lá thu nhỏ 12px. Bỏ padding thừa của thẻ hạng 1 (bậc giờ tạo độ cao), giữ nền vàng nhạt. Build + tsc + lint pass (chỉ 2 warning <img> cũ ở page.tsx). Chụp xác nhận 1440/390 cả mock 3 người và mock 1 người (ô trống 2/3 hiện đúng).
- 08/11/2026 — Anh báo bản zip bục Top 3 xấu, không giống demo: đo thực tế thấy thẻ hạng 1 cao 224px còn 2 thẻ ô trống chỉ 114px (gấp đôi) nên bục lệch hẳn, thẻ hạng 1 thừa khoảng trống dưới. Sửa: .leaderboard-top thêm justify-content: center + min-height: 250px (đủ chứa cả trường hợp hạng 1 là chính mình có nhãn "Bạn", đo được vẫn đúng 250px cả 3 thẻ); mobile reset min-height: 0 để hàng ngang vẫn gọn. Đo lại: 3 thẻ đều 250px, bậc teal vẫn bậc thang (slot 302/286/274px). Build + tsc pass, lint chỉ 2 warning <img> cũ. Chụp lại 1440/390: mock 1 người, mock 3 người, và trường hợp hạng 1 là chính mình có nhãn "Bạn" đều cân.
- 08/11/2026 — Anh so sánh 2 hình và chốt khôi phục bục Top 3 y hệt demo (zip trước chỉ sửa chiều cao thẻ nên vẫn lệch 7 điểm). Code lại đủ 7 điểm: (1) Cúp bục to: hạng 1 76px, hạng 2/3 68px (số trên cúp 30/26px, top 42.5% + nudge 0.035em giữ nguyên nên số vẫn vô giữa). (2) Cành lá vẽ lại to 40x84, 10 lá xen đậm/nhạt + 3 quả, thân cong xòe rộng. (3) Ô trống đủ 3 tầng: cúp mờ + cành lá mờ, vòng avatar đứt nét có icon User, nhãn "HẠNG 2"/"HẠNG 3" in đậm, rồi "Chưa có người đạt hạng này". (4) Lưới bục 1fr 1.18fr 1fr (cột giữa rộng hơn); thẻ hạng 1 min-height 308px, thẻ hạng 2/3 min-height 252px; avatar bục 88px. (5) Bậc teal đổi bo góc trên 12px 12px 0 0 (trước bo góc dưới, ngược demo). (6) Mobile giữ 3 cột chung 1 hàng (không xếp dọc nữa), nội dung thu nhỏ: cúp 44/40px, cành lá 20x42, avatar 40px, thẻ 210/190px. Đo lại: thẻ hạng 1 308px, ô trống 260px, thẻ có người hạng 2/3 296px; trường hợp hạng 1 là chính mình có nhãn "Bạn" thẻ 321px vẫn cân. Build + tsc pass, lint chỉ 2 warning <img> cũ. Chụp xác nhận 1440/390: mock 1 người, mock 3 người, hạng 1 có nhãn "Bạn" đều giống demo.
- 08/11/2026 — Anh gửi ảnh thẻ hạng 1 và chỉ 3 chỗ chưa giống demo: (1) Màu cúp hơi sậm — đổi cúp sáng hơn: vàng #d97706 → #f59e0b, bạc #9ca3af → #aab2bb, đồng #b45309 → #c2703d; màu cành lá sáng theo (vàng #f59e0b/#d97706, bạc #aab2bb/#7d858e, đồng #c2703d/#9a5a2e). (2) Cách lá chưa đúng — vẽ lại cành lá: thân cong xòe rộng hơn (về x=3), lá to hơn (rx 5.5) nghiêng ra ngoài 55°, tăng khoảng cách lá-cúp từ 2px lên 8px. (3) Thẻ và bậc teal dính nhau — thêm gap 10px vào .leaderboard-slot (mobile 6px), đo lại slot cao thêm đúng 10px. Build + tsc pass, lint chỉ 2 warning <img> cũ. Chụp xác nhận 1440/390 trường hợp hạng 1 là chính mình có nhãn "Bạn".
- 08/11/2026 — Anh yêu cầu cành lá 2 bên mở ra ngoài thêm tí: tăng khoảng cách lá-cúp từ 8px lên 12px (mobile giữ 6px để không tràn cột hẹp), nghiêng cành ra ngoài 5° (cành trái rotate(-5deg), cành phải scaleX(-1) rotate(-5deg) để đầu cành ngả ra ngoài). Build + tsc pass. Chụp xác nhận 1440/390 trường hợp hạng 1 là chính mình có nhãn "Bạn": cành lá xòe rộng hơn, tách rõ khỏi cúp, mobile không tràn.
- 08/11/2026 — Anh yêu cầu mobile Top 3 hiển thị 3 hàng ngang thay vì 3 cột như desktop/tablet. Đổi mobile (≤680px): podium 1 cột, thứ tự 1-2-3 (hạng 1 lên đầu), thẻ thành hàng ngang dạng lưới (cúp | avatar+tên | điểm), ô trống xếp lưới (cúp | avatar | nhãn+dòng chữ), bậc teal cao đều 24px. Cúp mobile thu nhỏ (32px, vàng 36px) + cành lá 14x30 để tên không bị cắt — đo lại tên "Minh Quân" vừa đủ 79px, không còn "Minh Q...". Build + tsc pass. Chụp xác nhận mobile 390 (mock 3 người + mock 1 người) và desktop 1440 (desktop giữ nguyên 3 cột 2-1-3).
- 08/11/2026 — Anh yêu cầu mobile bỏ hẳn bục: ẩn .leaderboard-step ở ≤680px (display: none), chỉ giữ 3 thẻ hàng ngang xếp dọc, desktop/tablet giữ nguyên bậc teal. Build pass. Chụp xác nhận mobile 390: 3 hàng ngang sạch, không còn bậc teal.
- 08/11/2026 — Anh hỏi tên dài thì sao, chọn phương án chữ tên nhỏ lại: mobile (≤680px) chữ tên trong bục Top 3 giảm xuống 13px. Kiểm chứng với tên 20 ký tự ("Nguyễn Trần Minh Quân"): 13px hiện được ~12 ký tự ("Nguyễn Trầ..."), vẫn cắt tên rất dài — đã báo anh, chờ anh quyết có kết hợp thêm xuống 2 dòng không. Build pass.
- 08/11/2026 — Anh hỏi chữ dài tự chạy ra được không: làm marquee cho tên dài ở bục Top 3 mobile. LeaderboardPlayer đo tên bị cắt (JS: offsetWidth tên − clientWidth khung clip; lưu ý <strong> inline nên scrollWidth/clientWidth = 0, phải dùng offsetWidth), chỉ tên dài mới gắn class name-marquee + biến --marquee-dist, CSS mobile (≤680px, chỉ trong .leaderboard-podium) chạy animation 5s: đứng yên 1s → cuộn trái hiện hết tên → đứng yên → cuộn về. Tên ngắn không chạy. Kiểm chứng: tên 20 ký tự chạy thật (đo được dist 61/54/42px, ảnh chụp 2 thời điểm khác nhau thấy chữ đã chạy), tên ngắn đứng yên, desktop 1440 tên dài hiện đủ không chạy. Build + tsc pass.
- 08/11/2026 — Anh chỉ ra tab Khóa học trong Quản trị thực ra chưa hề 2 bên (form trên, danh sách dưới) — do bản Figma cố tình ép lưới admin thành 1 cột (form rộng 880px). Đã sửa lại toàn bộ Quản trị thành 2 bên (hành động trái, danh sách phải) theo kế hoạch anh duyệt: bỏ ép 1 cột trong quizzy-layout.css, trả lưới .admin-grid về 2 cột (0.72fr/1.28fr); form trong cột trái hẹp thì các ô xếp chồng 1 cột. Khóa học/Chủ đề/Câu hỏi: chỉ đổi CSS (đã dùng sẵn lưới), form xếp chồng, danh sách sang phải. Duyệt project: panel trái hiện chi tiết bài nộp đã chọn (bấm dòng để chọn, dòng đang chọn tô sáng) + ô ghi chú + nút Duyệt/Yêu cầu sửa, panel phải là danh sách; hộp xác nhận giữ nguyên. Chứng nhận: panel chi tiết sang trái (đủ điều kiện, bảng topic, nút Duyệt/Từ chối/Thu hồi), phải là bộ lọc + duyệt hàng loạt + danh sách; bấm «Xem xét» mở chi tiết bên trái. Bảng xếp hạng: bộ lọc + nút Xuất XLSX sang trái (xếp chồng 1 cột), bảng sang phải. Mobile ≤900px xếp chồng (hành động trên, danh sách dưới). Build + tsc pass, chỉ còn 2 warning <img> cũ.
- 08/11/2026 — Format lại form tab Khóa học trong Quản trị cho chuẩn/chuyên nghiệp (anh yêu cầu sửa từng tab con, bắt đầu từ Khóa học): chia form thành 3 mục có tiêu đề (Thông tin cơ bản / Chủ đề trong khóa / Project cuối khóa), dấu * đỏ ở ô bắt buộc, gợi ý dưới ô Slug; ô chọn file bỏ hẳn kiểu native «Choose File», thay bằng khung viền đứt nét có nút «Chọn ảnh»/«Chọn file» + tên file đã chọn; danh sách chủ đề mỗi dòng hiện tên đậm + slug mờ ở dòng dưới, không cắt chữ, kèm số đếm «Đã chọn X/Y»; tick «Có project cuối khóa» có dòng giải thích, mục Đề project nằm trong khung nền mint; chân form có đường kẻ + nút Lưu nổi bật. Chỉ đổi hiển thị, không đổi tên field/API.
- 08/11/2026 — Form Khóa học chuyển sang popup (anh duyệt, vì form inline dài quá): tab Khóa học chỉ còn 1 panel danh sách toàn chiều rộng, nút «+ Tạo khóa học» nằm trên danh sách (đầu panel, bên phải tiêu đề). Bấm Tạo hoặc Sửa ở menu ⋮ đều mở cùng popup (rộng 640px, cao tối đa 90vh, thân cuộn, chân Lưu/Hủy cố định dưới); đóng bằng X, Hủy, bấm ra ngoài hoặc Escape, khóa cuộn nền khi mở. Trong popup rộng nên form gọn hơn: Tên + Slug 1 hàng, danh sách chủ đề 2 cột, Tên đề bài + Hạn nộp 1 hàng. Chỉ đổi hiển thị, không đổi tên field/API.
- 08/11/2026 — Sửa 2 điểm anh chỉ trong popup Khóa học: (1) ô Tên và Slug cao bằng nhau (cùng 46,8px, cùng 1 hàng) — do lưới 2 cột kéo giãn ô Tên theo ô Slug có gợi ý, đã đặt lưới trong popup căn lên trên; (2) tên và slug trong danh sách chủ đề xích lại gần nhau (bỏ khoảng cách giữa 2 dòng, chiều cao dòng 1,35 thay vì 1,55). Chỉ đổi CSS, không đổi JSX/logic.
- 08/11/2026 — Tab Chủ đề + Câu hỏi format giống tab Khóa học: form tạo/sửa vào popup (nút Tạo nằm trên danh sách), chia mục có tiêu đề, dấu * đỏ ở ô bắt buộc, ô chọn file kiểu mới; tab Câu hỏi tách Import hàng loạt ra popup riêng (nút 'Import hàng loạt' cạnh nút Tạo). Toast mới: báo tạo/sửa/xóa thành công và lỗi ở góc phải dưới, tự tắt sau 4,5 giây, bấm để tắt ngay (thay dòng chữ inline vốn bị popup che mất); lỗi tải trang vẫn hiện inline như cũ. Chỉ đổi hiển thị + thông báo, không đổi field/handler/API.
- 08/11/2026 — Thêm thanh tìm kiếm cho 3 tab Khóa học / Chủ đề / Câu hỏi (theo mẫu trang Khóa học công khai): ô nhập có icon kính lúp, lọc ngay khi gõ, không phân biệt hoa thường; Khóa học + Chủ đề tìm theo tên/slug trên danh sách đầy đủ đã tải (tối đa 100), Câu hỏi tìm theo mã/nội dung trên toàn bộ câu hỏi của chủ đề đang chọn (tải thêm tối đa 100 khi có từ khóa); khi tìm thì hiện số kết quả khớp và ẩn phân trang, không có kết quả thì báo 'Không tìm thấy...' kèm từ khóa. Chỉ đổi hiển thị/lọc, không đổi API hay dữ liệu.
- 08/11/2026 — Dời thanh tìm kiếm 3 tab Quản trị vào hàng tiêu đề (bên trái nút Tạo, gọn 240px) theo ý anh; ô tìm nền teal nhạt để khác hẳn hàng danh sách xám, mobile tự giãn full-width và xuống dòng gọn. Trước đó ô tìm full-width nằm sát danh sách (không có khoảng cách) nên nhìn bị dính — nay đã tách ra, khoảng cách tiêu đề–danh sách 18px. Chỉ đổi vị trí + màu nền, logic lọc giữ nguyên.
- 08/11/2026 — Ô tìm kiếm 3 tab Quản trị về đúng chuẩn form của app: bỏ nền teal (trông không giống form chuẩn), dùng class .search-input như trang Khóa học công khai — cao 46px bằng đúng nút Tạo, bo 11px, viền line, nền bg; icon kính lúp căn giữa. Chỉ đổi kiểu hiển thị, vị trí + logic lọc giữ nguyên.
- 08/11/2026 — Điều chỉnh 3 tab Quản trị còn lại cho hiện đại/chuẩn/UX: Duyệt project — tên + huy hiệu trạng thái trên 1 hàng, nút Duyệt/Yêu cầu sửa dính đáy panel (sticky, có kẻ trên) để luôn bấm được; Chứng nhận — ô tìm có icon kính lúp + chiếm trọn 2 cột lưới, hàng duyệt hàng loạt thành thanh riêng (checkbox trái, nút phải, có kẻ trên); Bảng xếp hạng — ô tìm có icon kính lúp như 2 tab kia. Chỉ đổi hiển thị, không đổi logic.
- 08/11/2026 — Sửa lỗi trùng key React ở Dashboard «Cần hoàn thành»: một topic dùng chung cho nhiều khóa thì trước đây hiện 2 lần (key topicId trùng → Next báo 6 lỗi). Nay khử trùng theo topicId, mỗi topic chỉ hiện 1 lần (nộp bài tính theo topic, không theo khóa). Chỉ đổi logic gom danh sách, không đổi hiển thị.
- 08/11/2026 — Dọn zip: xóa `fe/mock-api.cjs` (stub mock API chỉ dùng quay video demo, không phải code FE, không được file nào tham chiếu) khỏi bản giao — đã lọt vào zip làm zip 108 → 109 file. Lệnh zip chuẩn nay loại trừ thêm `fe/mock-api.cjs`.
- 08/11/2026 — Thu gọn aside + animation popup: nút thu gọn (icon « ») nằm ngang với profile ở cuối aside, chỉ desktop (mobile ẩn, giữ drawer); thu gọn aside 288px → 104px, chỉ hiện icon (tên/huy hiệu ẩn), nội dung giãn theo, nhớ trạng thái bằng localStorage, chuyển mượt 0,25s. Popup tạo/sửa/xóa (ConfirmDialog + dialog-wide) mở với animation: nền mờ dần 0,18s + hộp thoại trồi nhẹ từ dưới + phóng to 0,97→1 trong 0,22s; tự tắt animation khi user bật prefers-reduced-motion.
- 08/11/2026 — Sửa 3 lỗi thu gọn aside: (1) hover profile khi thu gọn bị lệch — nút profile giãn full-width nên nền hover là hình chữ nhật lệch khỏi avatar; nay nút ôm sát avatar (48px, padding 4px) nên nền hover là ô vuông gọn quanh avatar. (2) Logo lệch khi thu gọn — brand-row vẫn space-between nên logo dạt trái; nay căn giữa brand-row khi thu gọn (đo lệch tâm 0px). (3) Aside hẹp lại: 288px → 264px (cả sidebar + main-column).
