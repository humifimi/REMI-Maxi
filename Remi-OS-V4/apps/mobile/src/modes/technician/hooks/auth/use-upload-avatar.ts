import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";

interface UploadAvatarResult {
  profileImageUrl: string;
}

export function useUploadAvatar() {
  return useMutation({
    mutationFn: async (imageUri: string) => {
      const formData = new FormData();
      const ext = imageUri.endsWith(".png") ? "png" : "jpg";
      formData.append("avatar", {
        uri: imageUri,
        type: ext === "png" ? "image/png" : "image/jpeg",
        name: `avatar.${ext}`,
      } as unknown as Blob);

      const response = await apiClient.put<{
        error: boolean;
        message: string;
        data: UploadAvatarResult;
      }>(Endpoints.profileAvatar, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 30000,
      });

      return response.data.data;
    },
  });
}
