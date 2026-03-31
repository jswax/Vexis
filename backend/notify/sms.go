package notify

import (
	"fmt"
	"log"

	"github.com/twilio/twilio-go"
	twilioApi "github.com/twilio/twilio-go/rest/api/v2010"
)

// SendOTP sends via Twilio unless bypass is true (local dev: logs only, no API call).
func SendOTP(bypass bool, accountSID, authToken, fromNumber, toNumber, code string) error {
	if bypass {
		log.Printf("[SMS_BYPASS] OTP for %s: %s", toNumber, code)
		return nil
	}
	c := twilio.NewRestClientWithParams(twilio.ClientParams{
		Username: accountSID,
		Password: authToken,
	})
	body := fmt.Sprintf("Your Vexis verification code is %s. It expires in 10 minutes.", code)
	params := &twilioApi.CreateMessageParams{}
	params.SetTo(toNumber)
	params.SetFrom(fromNumber)
	params.SetBody(body)
	_, err := c.Api.CreateMessage(params)
	return err
}
