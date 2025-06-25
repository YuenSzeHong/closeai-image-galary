interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  text?: string;
  className?: string;
}

export default function LoadingSpinner({
  size = "md",
  text,
  className = "",
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  };

  return (
    <div class={`text-center ${className}`}>
      <div
        class={`inline-block ${
          sizeClasses[size]
        } animate-spin rounded-full border-4 border-solid border-primary-500 border-r-transparent`}
      >
      </div>
      {text && (
        <div class="mt-2">
          <p class="text-gray-600 dark:text-gray-400">{text}</p>
        </div>
      )}
    </div>
  );
}
