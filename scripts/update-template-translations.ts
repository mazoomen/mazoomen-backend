import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const translationsMap: Record<
  string,
  { titleAr: string; titleEn: string; descriptionAr: string; descriptionEn: string }
> = {
  'Royal Gold Wedding': {
    titleAr: 'دعوة زفاف الذهب الملكي',
    titleEn: 'Royal Gold Wedding',
    descriptionAr: 'تصميم زفاف ذهبي فاخر مع مؤثرات تساقط الثلوج وموسيقى خلفية ونظام تأكيد حضور متكامل.',
    descriptionEn: 'A luxurious gold-themed wedding invitation featuring snowfall effects, background music, and an integrated RSVP system.',
  },
  'Watercolor Garden Wedding': {
    titleAr: 'دعوة زفاف حديقة الألوان المائية',
    titleEn: 'Watercolor Garden Wedding',
    descriptionAr: 'تصميم زفاف ريفي ساحر مستوحى من الطبيعة مع خلفية فيديو للحديقة الغناء ونظام متكامل لتأكيد الحضور.',
    descriptionEn: 'A charming rustic garden wedding invitation design inspired by nature with dynamic video background and integrated RSVP system.',
  },
  'Boho Terracotta Wedding': {
    titleAr: 'دعوة زفاف بوهيمي تراكوتا',
    titleEn: 'Boho Terracotta Wedding',
    descriptionAr: 'تصميم زفاف بوهيمي دافئ مزين بالزهور المجففة وتدرجات التراكوتا مع مؤثرات تساقط أوراق الشجر وموسيقى خلفية.',
    descriptionEn: 'A warm bohemian wedding invitation design with dried flower accents, terracotta tones, falling leaf effects, and background music.',
  },
  'Watercolor Lily Wedding': {
    titleAr: 'دعوة زفاف زنبق الألوان المائية',
    titleEn: 'Watercolor Lily Wedding',
    descriptionAr: 'تصميم زفاف ناعم ومميز مستوحى من زهور الزنبق المائية وتدرجات اللافندر مع مؤثرات تساقط البتلات وموسيقى خلفية.',
    descriptionEn: 'A delicate wedding invitation design inspired by water lilies and lavender hues, with falling petals and background music.',
  },
  'Emerald Luxury Wedding': {
    titleAr: 'دعوة زفاف الزمرد الفاخر',
    titleEn: 'Emerald Luxury Wedding',
    descriptionAr: 'تصميم زفاف زمردي فاخر باللون الأخضر الداكن والذهبي الكلاسيكي مع مؤثرات تساقط الأوراق الذهبية وموسيقى خلفية متناغمة.',
    descriptionEn: 'A luxurious emerald green and classic gold wedding invitation with gold leaf particles animation and background music.',
  },
  'White Gypsophila Wedding': {
    titleAr: 'دعوة زفاف الجبسوفيلا البيضاء',
    titleEn: 'White Gypsophila Wedding',
    descriptionAr: 'تصميم زفاف أبيض ناصع مزين بزهور الجبسوفيلا البيضاء الناعمة مع خلفية فيديو أنيقة ومؤثرات تساقط الزهور.',
    descriptionEn: 'An elegant pure white wedding invitation adorned with white gypsophila flowers, featuring video background and falling floral effects.',
  },
  'Flow Wedding': {
    titleAr: 'دعوة زفاف انسيابية فاخرة',
    titleEn: 'Flow Wedding',
    descriptionAr: 'تصميم زفاف انسيابي فاخر مع خلفية فيديو فلو متدفقة ونظام متكامل لتأكيد الحضور.',
    descriptionEn: 'A luxury flowing wedding design with dynamic flow video background and integrated RSVP system.',
  },
  'Forest Foliage Wedding': {
    titleAr: 'دعوة زفاف أوراق الغابة الخضراء',
    titleEn: 'Forest Foliage Wedding',
    descriptionAr: 'تصميم زفاف راقٍ بألوان أوراق الشجر الداكنة والذهبي الدافئ، مع خلفية فيديو انسيابية ومؤثرات جزيئات متساقطة.',
    descriptionEn: 'A refined wedding design with deep forest green and gold hues, dynamic flowing background video, and delicate falling particles.',
  },
};

async function main() {
  console.log('Updating template translations (AR & EN) in database...');
  const templates = await prisma.template.findMany();

  for (const template of templates) {
    const translation = translationsMap[template.title] || translationsMap[template.titleEn || ''];
    if (translation) {
      await prisma.template.update({
        where: { id: template.id },
        data: {
          titleAr: translation.titleAr,
          titleEn: translation.titleEn,
          descriptionAr: translation.descriptionAr,
          descriptionEn: translation.descriptionEn,
        },
      });
      console.log(`Updated template: "${template.title}" -> AR: "${translation.titleAr}" | EN: "${translation.titleEn}"`);
    } else {
      await prisma.template.update({
        where: { id: template.id },
        data: {
          titleAr: template.titleAr || template.title,
          titleEn: template.titleEn || template.title,
          descriptionAr: template.descriptionAr || template.description,
          descriptionEn: template.descriptionEn || template.description,
        },
      });
      console.log(`Ensured fallbacks for template: "${template.title}"`);
    }
  }

  console.log('Template translations update finished successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
