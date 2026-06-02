export async function readCsvFromRequest(request: Request): Promise<{
  csvText: string;
  sourceFileName?: string;
}> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");
    const csvTextInput = formData.get("csvText");

    if (file instanceof File) {
      return {
        csvText: await file.text(),
        sourceFileName: file.name,
      };
    }

    if (typeof csvTextInput === "string") {
      return { csvText: csvTextInput };
    }
  }

  const body = (await request.json()) as {
    csvText?: string;
  };

  return {
    csvText: body.csvText || "",
  };
}
