package com.absuconnect.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.Bridge;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@CapacitorPlugin(name = "PhotoGallery")
public class PhotoGalleryPlugin extends Plugin {

    private static final int DEFAULT_MAX_COUNT = 10;
    private static final int MAX_ALLOWED_COUNT = 20;
    private static final long CACHE_TTL_MS = 60 * 60 * 1000L; // 1 hour

    @PluginMethod
    public void pickPhotos(PluginCall call) {
        launchMediaPicker(call);
    }

    @PluginMethod
    public void pickMedia(PluginCall call) {
        launchMediaPicker(call);
    }

    private void launchMediaPicker(PluginCall call) {
        int requestedMax = call.getInt("maxCount", DEFAULT_MAX_COUNT);
        int clampedMax = Math.max(1, Math.min(requestedMax, MAX_ALLOWED_COUNT));
        boolean includeVideos = call.getBoolean("includeVideos", true);

        Intent intent = buildPhotoPickerIntent(clampedMax, includeVideos);
        if (intent == null) {
            call.reject("No photo gallery application is available on this device.");
            return;
        }

        call.getData().put("resolvedMaxCount", clampedMax);
        startActivityForResult(call, intent, "handlePickResult");
    }

    private Intent buildPhotoPickerIntent(int maxCount, boolean includeVideos) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Intent photoPickerIntent = new Intent(MediaStore.ACTION_PICK_IMAGES);
            // Omitting setType() instructs the Android 13+ system Photo Picker to show
            // both photos and videos combined with zero runtime storage permissions.
            if (!includeVideos) {
                photoPickerIntent.setType("image/*");
            }
            if (maxCount > 1) {
                int systemLimit = MediaStore.getPickImagesMaxLimit();
                photoPickerIntent.putExtra(
                    MediaStore.EXTRA_PICK_IMAGES_MAX,
                    Math.min(maxCount, systemLimit)
                );
            }
            if (photoPickerIntent.resolveActivity(getContext().getPackageManager()) != null) {
                return photoPickerIntent;
            }
        }

        if (includeVideos) {
            Intent galleryBothIntent = new Intent(Intent.ACTION_PICK, MediaStore.Images.Media.EXTERNAL_CONTENT_URI);
            galleryBothIntent.setType("image/*,video/*");
            galleryBothIntent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/*", "video/*"});
            galleryBothIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, maxCount > 1);
            galleryBothIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (galleryBothIntent.resolveActivity(getContext().getPackageManager()) != null) {
                return galleryBothIntent;
            }

            Intent galleryFallbackIntent = new Intent(Intent.ACTION_PICK, MediaStore.Images.Media.EXTERNAL_CONTENT_URI);
            galleryFallbackIntent.setType("image/*");
            galleryFallbackIntent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/*", "video/*"});
            galleryFallbackIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, maxCount > 1);
            galleryFallbackIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (galleryFallbackIntent.resolveActivity(getContext().getPackageManager()) != null) {
                return galleryFallbackIntent;
            }
        } else {
            Intent galleryIntent = new Intent(Intent.ACTION_PICK, MediaStore.Images.Media.EXTERNAL_CONTENT_URI);
            galleryIntent.setType("image/*");
            galleryIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, maxCount > 1);
            galleryIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (galleryIntent.resolveActivity(getContext().getPackageManager()) != null) {
                return galleryIntent;
            }
        }

        Intent getContentIntent = new Intent(Intent.ACTION_GET_CONTENT);
        getContentIntent.setType(includeVideos ? "image/*" : "image/*");
        if (includeVideos) {
            getContentIntent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/*", "video/*"});
        }
        getContentIntent.addCategory(Intent.CATEGORY_OPENABLE);
        getContentIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, maxCount > 1);
        getContentIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        if (getContentIntent.resolveActivity(getContext().getPackageManager()) != null) {
            return getContentIntent;
        }

        return null;
    }

    @ActivityCallback
    private void handlePickResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject cancelled = new JSObject();
            cancelled.put("cancelled", true);
            cancelled.put("images", new JSArray());
            cancelled.put("media", new JSArray());
            call.resolve(cancelled);
            return;
        }

        Intent data = result.getData();
        int maxCount = call.getInt("resolvedMaxCount", DEFAULT_MAX_COUNT);
        List<Uri> selectedUris = extractSelectedUris(data, maxCount);

        if (selectedUris.isEmpty()) {
            JSObject empty = new JSObject();
            empty.put("cancelled", true);
            empty.put("images", new JSArray());
            empty.put("media", new JSArray());
            call.resolve(empty);
            return;
        }

        execute(() -> {
            try {
                File galleryDir = new File(getContext().getCacheDir(), "dm_gallery");
                if (!galleryDir.exists() && !galleryDir.mkdirs()) {
                    call.reject("Unable to prepare temporary gallery cache directory.");
                    return;
                }

                cleanupStaleCacheFiles(galleryDir);

                ContentResolver resolver = getContext().getContentResolver();
                String baseLocalUrl = getBridge().getLocalUrl();
                JSArray mediaArray = new JSArray();

                for (int i = 0; i < selectedUris.size(); i++) {
                    Uri uri = selectedUris.get(i);
                    String rawDisplayName = queryDisplayName(resolver, uri);
                    String mimeType = resolveMimeType(resolver, uri, rawDisplayName);
                    String displayName = (rawDisplayName != null && !rawDisplayName.isEmpty())
                        ? rawDisplayName
                        : buildFallbackDisplayName(mimeType, i);
                    String extension = resolveExtension(displayName, mimeType);
                    String uniqueCacheName = "dm_" + System.currentTimeMillis() + "_" + i + "_" +
                        UUID.randomUUID().toString().substring(0, 6) + "." + extension;

                    File cachedFile = new File(galleryDir, uniqueCacheName);
                    copyUriToFile(resolver, uri, cachedFile);

                    if (cachedFile.length() <= 0L) {
                        // Skip empty/corrupt selection
                        cachedFile.delete();
                        continue;
                    }

                    JSObject mediaObj = new JSObject();
                    mediaObj.put("path", cachedFile.getAbsolutePath());
                    mediaObj.put("webPath", baseLocalUrl + Bridge.CAPACITOR_FILE_START + cachedFile.getAbsolutePath());
                    mediaObj.put("name", displayName);
                    mediaObj.put("mimeType", mimeType);
                    mediaObj.put("kind", mimeType.startsWith("video/") ? "video" : "image");
                    mediaArray.put(mediaObj);
                }

                JSObject ret = new JSObject();
                ret.put("cancelled", mediaArray.length() == 0);
                ret.put("images", mediaArray);
                ret.put("media", mediaArray);
                call.resolve(ret);
            } catch (Exception ex) {
                call.reject("Failed to read selected media from gallery: " + ex.getMessage(), ex);
            }
        });
    }

    private List<Uri> extractSelectedUris(Intent data, int maxCount) {
        List<Uri> uris = new ArrayList<>();
        ClipData clipData = data.getClipData();
        if (clipData != null && clipData.getItemCount() > 0) {
            int limit = Math.min(clipData.getItemCount(), maxCount);
            for (int i = 0; i < limit; i++) {
                Uri itemUri = clipData.getItemAt(i).getUri();
                if (itemUri != null) {
                    uris.add(itemUri);
                }
            }
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }
        return uris;
    }

    private void cleanupStaleCacheFiles(File galleryDir) {
        File[] files = galleryDir.listFiles();
        if (files == null) return;
        long cutoff = System.currentTimeMillis() - CACHE_TTL_MS;
        for (File file : files) {
            if (file.isFile() && file.lastModified() < cutoff) {
                file.delete();
            }
        }
    }

    private String resolveMimeType(ContentResolver resolver, Uri uri, String displayName) {
        String mimeType = resolver.getType(uri);
        if (mimeType != null && (mimeType.startsWith("image/") || mimeType.startsWith("video/"))) {
            return mimeType;
        }
        if (displayName != null) {
            int dot = displayName.lastIndexOf('.');
            if (dot > 0 && dot < displayName.length() - 1) {
                String nameExt = displayName.substring(dot + 1).toLowerCase(Locale.US);
                String fromName = MimeTypeMap.getSingleton().getMimeTypeFromExtension(nameExt);
                if (fromName != null && (fromName.startsWith("image/") || fromName.startsWith("video/"))) {
                    return fromName;
                }
            }
        }
        String ext = MimeTypeMap.getFileExtensionFromUrl(uri.toString());
        if (ext != null && !ext.isEmpty()) {
            String guessed = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.toLowerCase(Locale.US));
            if (guessed != null && (guessed.startsWith("image/") || guessed.startsWith("video/"))) {
                return guessed;
            }
        }
        return "image/jpeg";
    }

    private String queryDisplayName(ContentResolver resolver, Uri uri) {
        Cursor cursor = null;
        try {
            cursor = resolver.query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null);
            if (cursor != null && cursor.moveToFirst()) {
                int colIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (colIndex >= 0) {
                    String name = cursor.getString(colIndex);
                    if (name != null && !name.trim().isEmpty()) {
                        return name.trim();
                    }
                }
            }
        } catch (Exception ignored) {
            // Fall back to generated filename below
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
        return null;
    }

    private String buildFallbackDisplayName(String mimeType, int index) {
        boolean isVideo = mimeType != null && mimeType.startsWith("video/");
        String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType);
        if (ext == null || ext.isEmpty()) {
            ext = isVideo ? "mp4" : "jpg";
        }
        return (isVideo ? "video_" : "photo_") + (index + 1) + "." + ext;
    }

    private String resolveExtension(String displayName, String mimeType) {
        int dotIdx = displayName.lastIndexOf('.');
        if (dotIdx > 0 && dotIdx < displayName.length() - 1) {
            String ext = displayName.substring(dotIdx + 1).toLowerCase(Locale.US).replaceAll("[^a-z0-9]", "");
            if (!ext.isEmpty() && ext.length() <= 5) {
                return ext;
            }
        }
        String fromMime = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType);
        if (fromMime != null && !fromMime.isEmpty()) {
            return fromMime;
        }
        return (mimeType != null && mimeType.startsWith("video/")) ? "mp4" : "jpg";
    }

    private void copyUriToFile(ContentResolver resolver, Uri uri, File destFile) throws Exception {
        try (InputStream in = resolver.openInputStream(uri);
             OutputStream out = new FileOutputStream(destFile)) {
            if (in == null) {
                throw new IllegalStateException("Unable to open selected media stream.");
            }
            byte[] buffer = new byte[16384];
            int bytesRead;
            while ((bytesRead = in.read(buffer)) != -1) {
                out.write(buffer, 0, bytesRead);
            }
            out.flush();
        }
    }
}
