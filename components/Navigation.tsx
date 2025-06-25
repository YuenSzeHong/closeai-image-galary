interface NavigationProps {
  currentPage: "gallery" | "settings" | "about";
}

export default function Navigation({ currentPage }: NavigationProps) {
  const navItems = [
    { id: "gallery", label: "图库", href: "/" },
    { id: "settings", label: "设置", href: "/settings" },
    { id: "about", label: "关于", href: "/about" },
  ];

  return (
    <nav class="mb-8">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-2 flex gap-1">
        {navItems.map((item) => (
          <a
            key={item.id}
            href={item.href}
            class={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              currentPage === item.id
                ? "bg-primary-500 text-white"
                : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
