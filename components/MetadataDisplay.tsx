interface MetadataDisplayProps {
  metadata: Record<string, unknown> | null;
}

export default function MetadataDisplay({ metadata }: MetadataDisplayProps) {
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return "N/A";
    if (typeof value === "boolean") return value ? "是" : "否";
    if (typeof value === "number") {
      // Handle timestamps
      if (typeof value === "number" && value > 1000000000 && value < 10000000000) {
        return new Date(value * 1000).toLocaleString();
      }
      return value.toString();
    }
    if (typeof value === "string") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.length > 0
        ? value.map((v) => formatValue(v)).join(", ")
        : "空数组";
    }
    if (typeof value === "object") {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  const renderMetadataField = (field: { key: string; label: string; value: unknown }) => {
    const formattedValue = formatValue(field.value);
    const isUrl = typeof field.value === "string" && field.value.startsWith("http");

    return (
      <div class="border-b border-gray-700 pb-2">
        <div class="text-gray-300 font-medium text-xs uppercase tracking-wide mb-1">
          {field.label}
        </div>
        <div class="text-white text-sm break-words">
          {isUrl ? (
            <a
              href={field.value as string}
              target="_blank"
              class="text-blue-400 hover:text-blue-300 break-all"
            >
              {formattedValue}
            </a>
          ) : formattedValue}
        </div>
      </div>
    );
  };

  const getMetadataFields = () => {
    if (!metadata) {
      return [];
    }

    const fields = [
      { key: "title", label: "标题", value: metadata.title },
      { key: "prompt", label: "提示词", value: metadata.prompt },
      { key: "created_at", label: "创建时间", value: metadata.created_at },
      {
        key: "width",
        label: "尺寸",
        value: metadata.width && metadata.height
          ? `${metadata.width} × ${metadata.height}`
          : undefined,
      },
      { key: "source", label: "来源", value: metadata.source },
      { key: "generation_type", label: "类型", value: metadata.generation_type },
    ].filter((field) =>
      field.value !== undefined && field.value !== null && field.value !== ""
    );

    return fields;
  };

  if (!metadata) {
    return <div class="text-gray-400">选择图像以查看元数据</div>;
  }

  return (
    <div class="space-y-3 text-sm">
      {getMetadataFields().map((field, index) => (
        <div key={index}>
          {renderMetadataField(field)}
        </div>
      ))}
    </div>
  );
}
