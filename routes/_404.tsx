import { Head } from "$fresh/runtime.ts";

export default function Error404() {
  return (
    <>
      <Head>
        <title>404 - 页面未找到</title>
      </Head>
      <div class="px-4 py-8 mx-auto bg-[#86efac]">
        <div class="max-w-screen-md mx-auto flex flex-col items-center justify-center">
          <img
            class="my-6"
            src="/logo.svg"
            width="128"
            height="128"
            alt="Fresh 标志：一片滴着汁水的柠檬片"
          />
          <h1 class="text-4xl font-bold">404 - 页面未找到</h1>
          <p class="my-4">
            您要查找的页面不存在。
          </p>
          <a href="/" class="underline">返回首页</a>
        </div>
      </div>
    </>
  );
}
