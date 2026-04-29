$ErrorActionPreference = 'Stop'
$sslDir = Join-Path $PSScriptRoot "ssl"
if (-not (Test-Path $sslDir)) { New-Item -ItemType Directory -Path $sslDir | Out-Null }

$certPath = Join-Path $sslDir "cert.pem"
$keyPath = Join-Path $sslDir "key.pem"
$pfxPath = Join-Path $sslDir "cert.pfx"

# Create self-signed certificate
$cert = New-SelfSignedCertificate `
  -Subject "CN=192.168.1.26" `
  -TextExtension @("2.5.29.17={text}IPAddress=192.168.1.26") `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -NotAfter (Get-Date).AddYears(1) `
  -KeyAlgorithm RSA `
  -KeyLength 2048 `
  -KeyExportPolicy Exportable `
  -FriendlyName "TikTok News Dev SSL"

Write-Host "Certificate created: $($cert.Thumbprint)"

# Export as PFX (contains both cert + key)
$pwd = ConvertTo-SecureString -String "temp123" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $pwd | Out-Null

# Export certificate (public part) as PEM
$certBytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
$certBase64 = [System.Convert]::ToBase64String($certBytes, [System.Base64FormattingOptions]::InsertLineBreaks)
$certPem = "-----BEGIN CERTIFICATE-----`r`n$certBase64`r`n-----END CERTIFICATE-----"
Set-Content -Path $certPath -Value $certPem -NoNewline -Encoding ASCII

# Clean up from cert store
Remove-Item "Cert:\CurrentUser\My\$($cert.Thumbprint)" -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "SSL files generated:" -ForegroundColor Green
Write-Host "  PFX:  $pfxPath (password: temp123)"
Write-Host "  CERT: $certPath"
Write-Host "  IP:   192.168.1.26"
Write-Host ""
Write-Host "Server will use PFX format directly." -ForegroundColor Yellow
