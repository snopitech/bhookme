package bhookme_backend.controller;

import bhookme_backend.dto.MessageRequest;
import bhookme_backend.dto.MessageResponse;
import bhookme_backend.service.MessageService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/messages")
public class MessageController {

    private final MessageService messageService;

    public MessageController(MessageService messageService) {
        this.messageService = messageService;
    }

    @PostMapping("/send")
    public ResponseEntity<?> send(Authentication authentication, @RequestBody MessageRequest request) {
        try {
            return ResponseEntity.ok(messageService.sendToHost(authentication.getName(), request));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @PostMapping("/reply/{receiverId}")
    public ResponseEntity<?> reply(Authentication authentication, @PathVariable Long receiverId,
                                    @RequestBody MessageRequest request) {
        try {
            return ResponseEntity.ok(messageService.reply(authentication.getName(), receiverId, request));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @GetMapping("/conversation/property/{propertyId}/with/{otherUserId}")
    public ResponseEntity<?> propertyConversation(Authentication authentication,
                                                   @PathVariable Long propertyId,
                                                   @PathVariable Long otherUserId) {
        try {
            List<MessageResponse> messages = messageService.getPropertyConversation(authentication.getName(), propertyId, otherUserId);
            return ResponseEntity.ok(messages);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @GetMapping("/conversation/car/{carId}/with/{otherUserId}")
    public ResponseEntity<?> carConversation(Authentication authentication,
                                              @PathVariable Long carId,
                                              @PathVariable Long otherUserId) {
        try {
            List<MessageResponse> messages = messageService.getCarConversation(authentication.getName(), carId, otherUserId);
            return ResponseEntity.ok(messages);
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    @GetMapping("/partners")
    public ResponseEntity<?> partners(Authentication authentication) {
        return ResponseEntity.ok(messageService.getConversationPartners(authentication.getName()));
    }

    // Inbox for the Host Dashboard: one thread per (guest, listing), newest first,
    // with the last message and how many are unread.
    @GetMapping("/threads")
    public ResponseEntity<?> threads(Authentication authentication) {
        try {
            return ResponseEntity.ok(messageService.getThreads(authentication.getName()));
        } catch (RuntimeException e) {
            return error(e);
        }
    }

    private ResponseEntity<?> error(RuntimeException e) {
        Map<String, String> body = new HashMap<>();
        body.put("message", e.getMessage());
        return ResponseEntity.badRequest().body(body);
    }
}