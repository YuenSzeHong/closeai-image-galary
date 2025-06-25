export default function Header() {
  return (
    <header class="mb-8">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h1 class="text-3xl font-bold text-center text-foreground">
            CloseAI 图库
          </h1>{" "}
          <p class="text-center text-muted-foreground">
            查看您生成的所有图像
          </p>
        </div>
      </div>{" "}
      <nav>
        <div class="bg-card rounded-lg shadow-md p-2 flex gap-1">
          <a
            href="/"
            class="px-4 py-2 rounded-md text-sm font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            图库
          </a>{" "}
          <a
            href="/settings"
            class="px-4 py-2 rounded-md text-sm font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            设置
          </a>
          <a
            href="/about"
            class="px-4 py-2 rounded-md text-sm font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            关于
          </a>
        </div>
      </nav>
    </header>
  );
}
