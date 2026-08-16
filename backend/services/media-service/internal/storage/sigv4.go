package storage

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"
)

type Signer struct {
	Endpoint, AccessKey, SecretKey, Region string
	now                                    func() time.Time
}

func NewSigner(endpoint, access, secret, region string) *Signer {
	return &Signer{Endpoint: strings.TrimRight(endpoint, "/"), AccessKey: access, SecretKey: secret, Region: region, now: time.Now}
}
func (s *Signer) Presign(method, bucket, key string, expires time.Duration) (string, error) {
	if s.AccessKey == "" || s.SecretKey == "" {
		return "", errors.New("object storage credentials are required")
	}
	if expires <= 0 || expires > 7*24*time.Hour {
		return "", errors.New("presign expiry must be between 1 second and 7 days")
	}
	now := s.now().UTC()
	target, err := url.Parse(s.Endpoint)
	if err != nil {
		return "", err
	}
	target.Path = path.Join(target.Path, bucket, key)
	date := now.Format("20060102")
	scope := date + "/" + s.Region + "/s3/aws4_request"
	query := target.Query()
	query.Set("X-Amz-Algorithm", "AWS4-HMAC-SHA256")
	query.Set("X-Amz-Credential", s.AccessKey+"/"+scope)
	query.Set("X-Amz-Date", now.Format("20060102T150405Z"))
	query.Set("X-Amz-Expires", strconv.FormatInt(int64(expires.Seconds()), 10))
	query.Set("X-Amz-SignedHeaders", "host")
	target.RawQuery = query.Encode()
	canonical := method + "\n" + target.EscapedPath() + "\n" + target.RawQuery + "\nhost:" + target.Host + "\n\nhost\nUNSIGNED-PAYLOAD"
	hashed := sha256.Sum256([]byte(canonical))
	toSign := "AWS4-HMAC-SHA256\n" + now.Format("20060102T150405Z") + "\n" + scope + "\n" + hex.EncodeToString(hashed[:])
	dateKey := sign([]byte("AWS4"+s.SecretKey), date)
	regionKey := sign(dateKey, s.Region)
	serviceKey := sign(regionKey, "s3")
	signingKey := sign(serviceKey, "aws4_request")
	signature := hex.EncodeToString(sign(signingKey, toSign))
	query.Set("X-Amz-Signature", signature)
	target.RawQuery = query.Encode()
	return target.String(), nil
}

func (s *Signer) Put(ctx context.Context, bucket, key, contentType string, content []byte) error {
	target, err := s.Presign(http.MethodPut, bucket, key, 5*time.Minute)
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPut, target, bytes.NewReader(content))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", contentType)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return err
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return errors.New("object storage upload failed with status " + response.Status)
	}
	return nil
}

func (s *Signer) Head(ctx context.Context, bucket, key string) (int64, error) {
	target, err := s.Presign(http.MethodHead, bucket, key, 5*time.Minute)
	if err != nil {
		return 0, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodHead, target, nil)
	if err != nil {
		return 0, err
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return 0, err
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return 0, errors.New("object storage metadata request failed with status " + response.Status)
	}
	if response.ContentLength < 0 {
		return 0, errors.New("object storage did not return content length")
	}
	return response.ContentLength, nil
}
func sign(key []byte, value string) []byte {
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(value))
	return mac.Sum(nil)
}
