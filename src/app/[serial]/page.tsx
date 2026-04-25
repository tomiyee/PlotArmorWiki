import { notFound } from 'next/navigation';
import { db } from '@/db/index';
import { serials, serialAuthors, chapters } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { titleToSlug } from '@/lib/slug';
import { addChapter } from './actions';

interface Props {
  params: Promise<{ serial: string }>;
}

export default async function SerialPage({ params }: Props) {
  const { serial: serialSlug } = await params;

  // Resolve the serial by matching the slug derived from each title
  const allSerials = await db
    .select()
    .from(serials);

  const serial = allSerials.find(
    (s) => titleToSlug(s.title) === serialSlug
  );

  if (!serial) {
    notFound();
  }

  const [authors, chapterList] = await Promise.all([
    db
      .select()
      .from(serialAuthors)
      .where(eq(serialAuthors.serialId, serial.id))
      .orderBy(serialAuthors.displayOrder),
    db
      .select()
      .from(chapters)
      .where(eq(chapters.serialId, serial.id))
      .orderBy(chapters.idx),
  ]);

  const addChapterForSerial = addChapter.bind(null, serial.id);

  return (
    <main className="flex flex-col items-center px-6 py-16 gap-8">
      <div className="w-full max-w-2xl flex flex-col gap-4">
        {/* Serial header */}
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold">{serial.title}</h1>
          {authors.length > 0 && (
            <p className="text-sm text-gray-500">
              {authors.map((a) => a.name).join(', ')}
            </p>
          )}
          {serial.description && (
            <p className="text-base text-gray-700 mt-1">{serial.description}</p>
          )}
        </div>

        {/* Chapter list */}
        <section className="flex flex-col gap-3 mt-4">
          <h2 className="text-xl font-semibold">Chapters</h2>
          {chapterList.length > 0 ? (
            <ol className="flex flex-col gap-2">
              {chapterList.map((chapter) => (
                <li
                  key={chapter.id}
                  className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm"
                >
                  <span className="font-medium">{chapter.displayName}</span>
                  <span className="text-gray-400">#{chapter.idx}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-gray-500">No chapters yet.</p>
          )}
        </section>

        {/* Add chapter form */}
        <section className="flex flex-col gap-3 mt-2">
          <h3 className="text-lg font-semibold">Add chapter</h3>
          <form action={addChapterForSerial} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="displayName" className="text-sm font-medium">
                Display name <span className="text-red-500">*</span>
              </label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                required
                placeholder="e.g. Chapter 1"
                className="rounded-lg border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="idx" className="text-sm font-medium">
                Index <span className="text-red-500">*</span>
              </label>
              <input
                id="idx"
                name="idx"
                type="number"
                required
                placeholder="e.g. 1"
                className="rounded-lg border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            <button
              type="submit"
              className="self-start rounded-lg bg-black px-5 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Add chapter
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
