package main

import (
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"time"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/joho/godotenv"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

var letterRunes = []rune("ABCDEFGHIJKLMNOPQRSTUVWXYZ")

type PreSignedRequest struct {
	Filename string `json:"filename"`
	Filesize string `json:"filesize"`
	Parts    int64  `json:"parts"`
}

type AbortRequest struct {
	Filename string `json:"filename"`
}

type CompleteParts struct {
	ETag       string `json:"eTag"`
	PartNumber int64  `json:"partNumber"`
}

type CompleteRequest struct {
	Filename       string          `json:"filename"`
	CompletedParts []CompleteParts `json:"completedParts"`
}

type GenericError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type PresignedResponse struct {
	Filename      string           `json:"filename"`
	PreSignedURLS map[int64]string `json:"preSignedUrls"`
	UploadId      string           `json:"uploadId"`
}

type App struct {
	S3Session *s3.S3
	Bucket    string
}

func AsCompletedMultipartParts(pr CompleteRequest) []*s3.CompletedPart {
	parts := pr.CompletedParts
	completedParts := make([]*s3.CompletedPart, len(pr.CompletedParts))

	for i := 0; i < len(parts); i++ {
		completedParts[i] = &s3.CompletedPart{
			ETag:       &parts[i].ETag,
			PartNumber: &parts[i].PartNumber,
		}
	}

	return completedParts
}

func (a *App) GeneratePreSignedUrl(c echo.Context) error {
	logger := c.Logger()
	r := new(PreSignedRequest)

	if err := c.Bind(r); err != nil {
		logger.Fatal(err)
		return c.JSON(http.StatusBadRequest, &GenericError{
			Code:    400,
			Message: "Bad Request",
		})
	}

	var signedUrlMap map[int64]string = make(map[int64]string)

	keyName := fmt.Sprintf("%s_%s", RandStringRunes(5), r.Filename)

	res, _ := a.S3Session.CreateMultipartUpload(&s3.CreateMultipartUploadInput{
		Bucket: aws.String(a.Bucket),
		Key:    aws.String(keyName),
	})

	uploadId := res.UploadId

	for i := int64(1); i <= r.Parts; i++ {
		req, _ := a.S3Session.UploadPartRequest(&s3.UploadPartInput{
			Bucket:     aws.String(a.Bucket),
			Key:        aws.String(keyName),
			PartNumber: aws.Int64(i),
			UploadId:   uploadId,
		})
		urlStr, _ := req.Presign(2 * time.Minute)
		signedUrlMap[i] = urlStr
	}

	return c.JSON(http.StatusOK, &PresignedResponse{
		Filename:      keyName,
		PreSignedURLS: signedUrlMap,
		UploadId:      *uploadId,
	})
}

func (a *App) AbortMultiPartUpload(c echo.Context) error {
	logger := c.Logger()
	uploadId := c.Param("uploadId")
	r := new(AbortRequest)

	if err := c.Bind(r); err != nil {
		logger.Fatal(err)
		return c.JSON(http.StatusBadRequest, &GenericError{
			Code:    400,
			Message: "Bad Request",
		})
	}

	a.S3Session.AbortMultipartUpload(&s3.AbortMultipartUploadInput{
		Bucket:   aws.String(a.Bucket),
		Key:      aws.String(r.Filename),
		UploadId: &uploadId,
	})

	return c.JSON(http.StatusOK, &GenericError{
		Code:    http.StatusOK,
		Message: "Aborted",
	})
}

func (a *App) CompleteMultiPartUpload(c echo.Context) error {
	logger := c.Logger()
	uploadId := c.Param("uploadId")
	r := new(CompleteRequest)

	if err := c.Bind(r); err != nil {
		logger.Fatal(err)
		return c.JSON(http.StatusBadRequest, &GenericError{
			Code:    400,
			Message: "Bad Request",
		})
	}

	parts := AsCompletedMultipartParts(*r)

	resp, err := a.S3Session.CompleteMultipartUpload(&s3.CompleteMultipartUploadInput{
		Bucket:   aws.String(a.Bucket),
		Key:      aws.String(r.Filename),
		UploadId: aws.String(uploadId),
		MultipartUpload: &s3.CompletedMultipartUpload{
			Parts: parts,
		},
	})

	if err != nil {
		return c.JSON(http.StatusInternalServerError, &GenericError{
			Code:    http.StatusInternalServerError,
			Message: err.Error(),
		})
	}

	return c.JSON(http.StatusOK, &GenericError{
		Code:    http.StatusOK,
		Message: *resp.Key,
	})
}

func init() {
	err := godotenv.Load()

	if err != nil {
		log.Panic("Error loading .env")
	}
}

func main() {

	sess, err := session.NewSession(&aws.Config{
		Region: aws.String(os.Getenv("AWS_REGION")),
	})

	if err != nil {
		log.Panic("Error Creating S3 Session")
	}

	app := &App{
		S3Session: s3.New(sess),
		Bucket:    os.Getenv("S3_BUCKET"),
	}

	e := echo.New()
	e.Use(middleware.Logger())
	e.Use(middleware.CORSWithConfig(middleware.DefaultCORSConfig))
	e.POST("/upload", app.GeneratePreSignedUrl)
	e.POST("/upload/:uploadId/abort", app.AbortMultiPartUpload)
	e.POST("/upload/:uploadId/complete", app.CompleteMultiPartUpload)
	e.Logger.Fatal(e.Start(":8080"))
}

func RandStringRunes(n int) string {
	b := make([]rune, n)

	for i := range b {
		r := rand.New(rand.NewSource(time.Now().UnixNano()))
		b[i] = letterRunes[r.Intn(len(letterRunes))]
	}
	return string(b)
}
