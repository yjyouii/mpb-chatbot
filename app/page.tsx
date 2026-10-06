export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <h1 className="text-5xl font-bold tracking-tight text-black dark:text-zinc-50">
        mpb챗봇
      </h1>
      <p className="mt-6 text-lg text-zinc-600 dark:text-zinc-400">
        보도자료 내용을 문장으로 물어보세요.
      </p>
    </div>
  );
}
