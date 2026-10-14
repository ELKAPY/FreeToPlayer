package main

import (
	"bytes"
	"encoding/binary"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/dhowden/tag"
)

// ExtractMetadata extracts metadata, cover picture, and format information from an audio file.
func ExtractMetadata(filePath string, originalName string) (Track, []byte, string) {
	ext := strings.ToLower(filepath.Ext(filePath))
	formatName := strings.TrimPrefix(ext, ".")
	if formatName != "" {
		formatName = strings.ToUpper(formatName)
	} else {
		formatName = "AUDIO"
	}

	isLossless := formatName == "FLAC" || formatName == "WAV" || formatName == "AIFF" || formatName == "ALAC"

	fi, err := os.Stat(filePath)
	var fileSize int64
	if err == nil {
		fileSize = fi.Size()
	}

	track := Track{
		Title:        cleanFilename(originalName),
		Artist:       "Unknown Artist",
		Album:        "Unknown Album",
		Year:         0,
		Format:       formatName,
		IsLossless:   isLossless,
		FileSize:     fileSize,
		OriginalName: originalName,
	}

	var coverBytes []byte
	var coverExt string

	f, err := os.Open(filePath)
	if err == nil {
		defer f.Close()

		// Read audio tags if supported
		m, err := tag.ReadFrom(f)
		if err == nil {
			if strings.TrimSpace(m.Title()) != "" {
				track.Title = strings.TrimSpace(m.Title())
			}
			if strings.TrimSpace(m.Artist()) != "" {
				track.Artist = strings.TrimSpace(m.Artist())
			}
			if strings.TrimSpace(m.Album()) != "" {
				track.Album = strings.TrimSpace(m.Album())
			}
			if m.Year() > 0 {
				track.Year = m.Year()
			}
			if strings.TrimSpace(m.Genre()) != "" {
				track.Genre = strings.TrimSpace(m.Genre())
			}

			// Extract cover image
			pic := m.Picture()
			if pic != nil && len(pic.Data) > 0 {
				coverBytes = pic.Data
				coverExt = strings.ToLower(pic.Ext)
				if coverExt == "" {
					coverExt = "jpg"
				}
				track.HasCover = true
				track.CoverExt = coverExt
			}
		}

		// Calculate duration
		_, _ = f.Seek(0, io.SeekStart)
		if formatName == "FLAC" {
			track.Duration = parseFLACDuration(f)
		} else if formatName == "WAV" {
			track.Duration = parseWAVDuration(f)
		}
	}

	return track, coverBytes, coverExt
}

func cleanFilename(name string) string {
	ext := filepath.Ext(name)
	base := strings.TrimSuffix(name, ext)
	return strings.TrimSpace(base)
}

// parseFLACDuration reads the STREAMINFO block of a FLAC file to calculate duration
func parseFLACDuration(r io.ReadSeeker) float64 {
	header := make([]byte, 4)
	if _, err := io.ReadFull(r, header); err != nil || string(header) != "fLaC" {
		return 0
	}

	blockHeader := make([]byte, 4)
	if _, err := io.ReadFull(r, blockHeader); err != nil {
		return 0
	}

	blockType := blockHeader[0] & 0x7F
	if blockType != 0 { // STREAMINFO is 0
		return 0
	}

	streamInfo := make([]byte, 34)
	if _, err := io.ReadFull(r, streamInfo); err != nil {
		return 0
	}

	// Sample rate: 20 bits (bytes 10, 11, and upper 4 bits of byte 12)
	sampleRate := uint32(streamInfo[10])<<12 | uint32(streamInfo[11])<<4 | uint32(streamInfo[12]>>4)

	// Total samples: 36 bits (lower 4 bits of byte 13 + bytes 14, 15, 16, 17)
	totalSamples := uint64(streamInfo[13]&0x0F)<<32 |
		uint64(streamInfo[14])<<24 |
		uint64(streamInfo[15])<<16 |
		uint64(streamInfo[16])<<8 |
		uint64(streamInfo[17])

	if sampleRate > 0 && totalSamples > 0 {
		return float64(totalSamples) / float64(sampleRate)
	}
	return 0
}

// parseWAVDuration reads RIFF/WAV header to calculate duration
func parseWAVDuration(r io.ReadSeeker) float64 {
	buf := make([]byte, 12)
	if _, err := io.ReadFull(r, buf); err != nil {
		return 0
	}
	if string(buf[0:4]) != "RIFF" || string(buf[8:12]) != "WAVE" {
		return 0
	}

	var byteRate uint32
	var dataSize uint32

	chunkHeader := make([]byte, 8)
	for {
		if _, err := io.ReadFull(r, chunkHeader); err != nil {
			break
		}
		chunkID := string(chunkHeader[0:4])
		chunkSize := binary.LittleEndian.Uint32(chunkHeader[4:8])

		if chunkID == "fmt " {
			fmtData := make([]byte, chunkSize)
			if _, err := io.ReadFull(r, fmtData); err != nil {
				break
			}
			if len(fmtData) >= 12 {
				byteRate = binary.LittleEndian.Uint32(fmtData[8:12])
			}
		} else if chunkID == "data" {
			dataSize = chunkSize
			break
		} else {
			// Skip chunk
			if _, err := r.Seek(int64(chunkSize), io.SeekCurrent); err != nil {
				break
			}
		}

		// WAV chunk padding (if chunkSize is odd, 1 pad byte)
		if chunkSize%2 != 0 {
			if _, err := r.Seek(1, io.SeekCurrent); err != nil {
				break
			}
		}
	}

	if byteRate > 0 && dataSize > 0 {
		return float64(dataSize) / float64(byteRate)
	}
	return 0
}

// SniffContentType returns the MIME type for an audio extension
func SniffContentType(ext string) string {
	switch strings.ToLower(ext) {
	case ".flac":
		return "audio/flac"
	case ".wav":
		return "audio/wav"
	case ".mp3":
		return "audio/mpeg"
	case ".ogg":
		return "audio/ogg"
	case ".m4a":
		return "audio/mp4"
	case ".aac":
		return "audio/aac"
	case ".opus":
		return "audio/opus"
	case ".weba", ".webm":
		return "audio/webm"
	default:
		return "application/octet-stream"
	}
}

// DetectImageMime determines mime for cover image
func DetectImageMime(data []byte) string {
	if bytes.HasPrefix(data, []byte("\x89PNG\r\n\x1a\n")) {
		return "image/png"
	}
	if bytes.HasPrefix(data, []byte("\xff\xd8\xff")) {
		return "image/jpeg"
	}
	if bytes.HasPrefix(data, []byte("GIF8")) {
		return "image/gif"
	}
	if bytes.HasPrefix(data, []byte("RIFF")) && len(data) > 12 && string(data[8:12]) == "WEBP" {
		return "image/webp"
	}
	return "image/jpeg"
}
