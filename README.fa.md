<div dir="rtl">

# OpenHeader

افزونه‌ی کوچک و متن‌باز کروم برای تغییر هدرهای HTTP (درخواست و پاسخ) — جایگزینِ تمیز و شفافِ ModHeader.

📄 English: [README.md](README.md)

## نصب

۱. برو به `chrome://extensions`
۲. **Developer mode** را روشن کن (بالا-راست)
۳. روی **Load unpacked** بزن و همین پوشه را انتخاب کن

## امنیت

خیالت راحت باشد — هیچ چیز خاصی ندارد:

- بدون سرور خارجی، بدون آنالیتیکس، بدون ردیابی.
- کد minify/مبهم نشده؛ هر خطش خواناست.
- از API استاندارد `declarativeNetRequest` استفاده می‌کند، پس افزونه اصلاً محتوای درخواست‌ها را نمی‌خواند.
- همه‌ی داده‌ها فقط در `chrome.storage.local` روی دستگاه خودت می‌ماند.

## مجوز

MIT — [github.com/alinemone/modheader](https://github.com/alinemone/modheader)

</div>
