package com.doctorvet.security.ssrf;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.InetAddress;
import java.net.URI;
import java.util.Locale;
import java.util.Set;

/**
 * Enterprise SSRF (Server-Side Request Forgery) Protection Service
 * Validates outgoing URIs to prevent requests targeting internal networks,
 * localhost, cloud metadata services (e.g. AWS 169.254.169.254), or private subnets.
 */
@Service
public class SsrfProtectionService {

    private static final Logger log = LoggerFactory.getLogger(SsrfProtectionService.class);

    private static final Set<String> ALLOWED_SCHEMES = Set.of("https", "http");

    /**
     * Verify if an external URL is safe against SSRF attacks.
     */
    public boolean isSafeUrl(String urlString) {
        if (urlString == null || urlString.isBlank()) {
            return false;
        }
        try {
            URI uri = URI.create(urlString.trim());
            String scheme = uri.getScheme();
            if (scheme == null || !ALLOWED_SCHEMES.contains(scheme.toLowerCase(Locale.ROOT))) {
                log.warn("[SsrfProtection] Blocked non-HTTP scheme: {}", scheme);
                return false;
            }

            String host = uri.getHost();
            if (host == null || host.isBlank()) {
                return false;
            }

            String lowerHost = host.toLowerCase(Locale.ROOT);
            if (lowerHost.equals("localhost")
                    || lowerHost.endsWith(".localhost")
                    || lowerHost.equals("metadata.google.internal")
                    || lowerHost.contains("169.254.169.254")) {
                log.warn("[SsrfProtection] Blocked forbidden hostname: {}", host);
                return false;
            }

            // Resolve IP and check if private/loopback/link-local
            InetAddress[] addresses = InetAddress.getAllByName(host);
            for (InetAddress addr : addresses) {
                if (isPrivateOrLoopback(addr)) {
                    log.warn("[SsrfProtection] Blocked private IP address for host {}: {}", host, addr.getHostAddress());
                    return false;
                }
            }
            return true;
        } catch (Exception e) {
            log.warn("[SsrfProtection] Error resolving URL {}: {}", urlString, e.getMessage());
            return false;
        }
    }

    private boolean isPrivateOrLoopback(InetAddress addr) {
        if (addr.isAnyLocalAddress() || addr.isLoopbackAddress() || addr.isLinkLocalAddress()) {
            return true;
        }
        if (addr.isSiteLocalAddress()) {
            return true; // 10.x.x.x, 172.16-31.x.x, 192.168.x.x
        }
        byte[] bytes = addr.getAddress();
        // IPv4 checks
        if (bytes.length == 4) {
            int b0 = bytes[0] & 0xFF;
            int b1 = bytes[1] & 0xFF;
            // 10.0.0.0/8
            if (b0 == 10) return true;
            // 172.16.0.0/12
            if (b0 == 172 && (b1 >= 16 && b1 <= 31)) return true;
            // 192.168.0.0/16
            if (b0 == 192 && b1 == 168) return true;
            // 169.254.0.0/16 (Cloud metadata & link local)
            if (b0 == 169 && b1 == 254) return true;
            // 127.0.0.0/8 (Loopback)
            if (b0 == 127) return true;
            // 0.0.0.0
            if (b0 == 0) return true;
        }
        return false;
    }
}

