# OpenCode IQ

**تطوير [YAHIA](https://github.com/yahiamee).**

[English](README.md) · [ترخيص MIT](LICENSE) · [صفحة الإصدار](https://github.com/yahiamee/opencode-iq/releases/tag/v0.5.0)

إضافة مستقلة ومفتوحة المصدر لـ OpenCode V1 تساعدك على فهم الكود الذي تعمل عليه، واختبار فهمك، ومراجعة ما تم تقييمه على مستوى الملفات والوحدات. الفهرسة محلية افتراضياً. تزوّد JavaScript وTypeScript بتحليل بنيوي وتحديات محدودة، وتدعم لغات أخرى عبر فهرسة الملفات النصية والأسئلة المفتوحة.

## التثبيت السريع

أضف الرابط إلى قائمة `plugin` الحالية في `opencode.json` مع الاحتفاظ بالإضافات الموجودة.

```json
{
  "plugin": ["https://github.com/yahiamee/opencode-iq/releases/download/v0.5.0/opencode-iq-0.5.0.tgz"]
}
```

أعد تشغيل OpenCode، ثم جرّب `/iq-help`. يتولى OpenCode تنزيل الحزمة واعتمادياتها. اختُبرت النسخة التجريبية `v0.5.0` على Windows مع OpenCode ‏1.19.6. للإزالة، احذف الرابط من القائمة وأعد تشغيل OpenCode.

تظل التقارير محلية افتراضياً. مشاركة بيانات التقرير مع النموذج اختيارية عبر `shareReports`، ومشاركة مقتطفات الكود تتطلب أيضاً `shareSource` وطلباً صريحاً. توضح [وثائق الأمان](SECURITY.md) نطاق البيانات والميزات التي تعتمد على Docker أو GitHub.

## الملاحظات والمساهمة

- أرسل ملاحظاتك أو بلّغ عن مشكلة عبر [GitHub Issues](https://github.com/yahiamee/opencode-iq/issues).
- راجع [دليل الاستخدام الكامل](README.md) و[حالة الميزات والتحقق](docs/implementation-status.md).

OpenCode IQ مشروع مجتمعي مستقل عن فريق OpenCode.

## الترخيص وحقوق المؤلف

ترخيص الإضافة هو [MIT](LICENSE). يحق لأي شخص استخدامها وتعديلها وإعادة توزيعها، بما في ذلك الاستخدام التجاري، بشرط إبقاء إشعار حقوق المؤلف باسم **YAHIA ومساهمي OpenCode IQ** وإشعار الإذن الوارد في الترخيص في كل نسخة أو جزء جوهري من الإضافة.
