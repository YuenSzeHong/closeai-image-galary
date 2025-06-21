import { Head } from "$fresh/runtime.ts";
import { useTranslation } from "../hooks/useTranslation.ts";

export default function Error404() {
  const { t } = useTranslation();

  return (
    <>
      <Head>
        <title>{t("meta.notFoundTitle")}</title>
      </Head>
      <div class="px-4 py-8 mx-auto bg-[#86efac]">
        <div class="max-w-screen-md mx-auto flex flex-col items-center justify-center">
          <img
            class="my-6"
            src="/logo.svg"
            width="128"
            height="128"
            alt={t("meta.logoAlt")}
          />
          <h1 class="text-4xl font-bold">{t("meta.notFoundHeading")}</h1>
          <p class="my-4">
            {t("meta.notFoundMessage")}
          </p>
          <a href="/" class="underline">{t("meta.notFoundHome")}</a>
        </div>
      </div>
    </>
  );
}
